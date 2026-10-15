#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#ifndef _WINSOCK_DEPRECATED_NO_WARNINGS
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#endif

#include "http.h"
#include "network.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <direct.h>

#define LINE_MAX_LEN   4096
#define CHUNK          65536

// ---------- utilità piccole ----------

// Confronto tra stringhe senza distinguere maiuscole/minuscole (gli header
// HTTP possono arrivare scritti in qualunque combinazione, es. "content-length").
static int ci_equal(const char *a, const char *b) {
    while (*a && *b) {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) return 0;
        a++; b++;
    }
    return *a == '\0' && *b == '\0';
}

// "%20" -> spazio, "+" -> spazio: il minimo per decodificare un nome file
// che il browser codifica con encodeURIComponent().
static void url_decode(const char *src, char *dst, size_t dst_size) {
    size_t j = 0;
    for (size_t i = 0; src[i] != '\0' && j + 1 < dst_size; i++) {
        if (src[i] == '%' && isxdigit((unsigned char)src[i + 1]) && isxdigit((unsigned char)src[i + 2])) {
            char hex[3] = { src[i + 1], src[i + 2], '\0' };
            dst[j++] = (char)strtol(hex, NULL, 16);
            i += 2;
        } else if (src[i] == '+') {
            dst[j++] = ' ';
        } else {
            dst[j++] = src[i];
        }
    }
    dst[j] = '\0';
}

// Un nome file non deve poter far scrivere fuori dalla cartella di destinazione.
static int name_is_safe(const char *name) {
    if (name[0] == '\0') return 0;
    if (strstr(name, "..")) return 0;
    if (strpbrk(name, "\\/:*?\"<>|")) return 0;
    return 1;
}

// Legge una riga terminata da '\n' (il '\r' viene ignorato ovunque si trovi).
// Ritorna la lunghezza della riga, 0 per una riga vuota (fine header), -1 su errore.
static int read_line(SOCKET s, char *buf, int max) {
    int i = 0;
    for (;;) {
        char c;
        int n = recv(s, &c, 1, 0);
        if (n <= 0) return -1;
        if (c == '\r') continue;
        if (c == '\n') { buf[i] = '\0'; return i; }
        if (i < max - 1) buf[i++] = c;
    }
}

int http_parse_request(SOCKET s, http_request *req) {
    char line[LINE_MAX_LEN];

    if (read_line(s, line, sizeof(line)) <= 0) return -1;

    char path[HTTP_MAX_PATH];
    if (sscanf(line, "%7s %511s", req->method, path) != 2) return -1;
    strncpy(req->path, path, sizeof(req->path) - 1);
    req->path[sizeof(req->path) - 1] = '\0';

    req->content_length = -1;
    req->file_name[0] = '\0';

    for (;;) {
        int n = read_line(s, line, sizeof(line));
        if (n < 0) return -1;
        if (n == 0) break; // riga vuota = fine degli header

        char *colon = strchr(line, ':');
        if (!colon) continue;
        *colon = '\0';
        char *name = line;
        char *value = colon + 1;
        while (*value == ' ') value++;

        if (ci_equal(name, "Content-Length")) {
            req->content_length = atol(value);
        } else if (ci_equal(name, "X-File-Name")) {
            url_decode(value, req->file_name, sizeof(req->file_name));
        }
    }
    return 0;
}

// ---------- invio delle risposte ----------

// Header comuni a ogni risposta: permettono alla pagina di funzionare sia
// servita da qui sia aperta da un'altra origine (es. "npm run dev" durante
// lo sviluppo), dove il browser applicherebbe altrimenti il blocco CORS.
static void send_cors_and_status(SOCKET s, int code, const char *status_text) {
    char header[256];
    snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Headers: Content-Type, X-File-Name\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n",
        code, status_text);
    send_all(s, header, strlen(header));
}

static void send_text_response(SOCKET s, int code, const char *status_text,
                                const char *content_type, const char *body) {
    send_cors_and_status(s, code, status_text);
    size_t body_len = strlen(body);
    char header[128];
    snprintf(header, sizeof(header),
        "Content-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
        content_type, body_len);
    send_all(s, header, strlen(header));
    send_all(s, body, body_len);
}

static void send_no_body_response(SOCKET s, int code, const char *status_text) {
    send_cors_and_status(s, code, status_text);
    const char *end = "Content-Length: 0\r\nConnection: close\r\n\r\n";
    send_all(s, end, strlen(end));
}

// ---------- file statici (la pagina React compilata) ----------

static const char *content_type_for(const char *path) {
    const char *ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";
    if (ci_equal(ext, ".html")) return "text/html; charset=utf-8";
    if (ci_equal(ext, ".js"))   return "text/javascript";
    if (ci_equal(ext, ".css"))  return "text/css";
    if (ci_equal(ext, ".json")) return "application/json";
    if (ci_equal(ext, ".svg"))  return "image/svg+xml";
    if (ci_equal(ext, ".png"))  return "image/png";
    if (ci_equal(ext, ".ico"))  return "image/x-icon";
    return "application/octet-stream";
}

static void serve_static_file(SOCKET s, const char *web_dir, const char *req_path) {
    if (strstr(req_path, "..")) { send_text_response(s, 400, "Bad Request", "text/plain", "percorso non valido"); return; }

    char full_path[1024];
    if (strcmp(req_path, "/") == 0)
        snprintf(full_path, sizeof(full_path), "%s/index.html", web_dir);
    else
        snprintf(full_path, sizeof(full_path), "%s%s", web_dir, req_path);

    FILE *f = fopen(full_path, "rb");
    if (!f) {
        send_text_response(s, 404, "Not Found", "text/plain", "pagina non trovata");
        return;
    }

    _fseeki64(f, 0, SEEK_END);
    uint64_t size = (uint64_t)_ftelli64(f);
    _fseeki64(f, 0, SEEK_SET);

    send_cors_and_status(s, 200, "OK");
    char header[256];
    snprintf(header, sizeof(header),
        "Content-Type: %s\r\nContent-Length: %llu\r\nConnection: close\r\n\r\n",
        content_type_for(full_path), (unsigned long long)size);
    send_all(s, header, strlen(header));

    char buf[CHUNK];
    size_t got;
    while ((got = fread(buf, 1, sizeof(buf), f)) > 0) {
        if (send_all(s, buf, got) != 0) break;
    }
    fclose(f);
}

// ---------- upload ----------

static void handle_upload(SOCKET s, const http_request *req, const char *upload_dir) {
    if (req->content_length < 0) {
        send_text_response(s, 400, "Bad Request", "text/plain", "Content-Length mancante");
        return;
    }

    char file_name[HTTP_MAX_NAME];
    if (req->file_name[0] != '\0' && name_is_safe(req->file_name)) {
        strncpy(file_name, req->file_name, sizeof(file_name) - 1);
        file_name[sizeof(file_name) - 1] = '\0';
    } else {
        strcpy(file_name, "upload.bin");
    }

    _mkdir(upload_dir);
    char full_path[1024];
    snprintf(full_path, sizeof(full_path), "%s/%s", upload_dir, file_name);

    FILE *f = fopen(full_path, "wb");
    if (!f) {
        send_text_response(s, 500, "Internal Server Error", "text/plain", "impossibile creare il file");
        return;
    }

    printf("Ricevo '%s' (%ld byte)\n", file_name, req->content_length);

    char buf[CHUNK];
    long remaining = req->content_length;
    int ok = 1;
    while (remaining > 0) {
        int want = remaining > CHUNK ? CHUNK : (int)remaining;
        int n = recv(s, buf, want, 0);
        if (n <= 0) { ok = 0; break; }
        if (fwrite(buf, 1, (size_t)n, f) != (size_t)n) { ok = 0; break; }
        remaining -= n;
    }
    fclose(f);

    if (!ok) {
        send_text_response(s, 500, "Internal Server Error", "text/plain", "trasferimento interrotto");
        return;
    }

    char body[512];
    snprintf(body, sizeof(body), "{\"status\":\"ok\",\"name\":\"%s\",\"size\":%ld}", file_name, req->content_length);
    send_text_response(s, 200, "OK", "application/json", body);
    printf("Salvato in %s\n", full_path);
}

// ---------- dispatch ----------

void http_handle_client(SOCKET client, const char *web_dir, const char *upload_dir) {
    http_request req;
    if (http_parse_request(client, &req) != 0) {
        closesocket(client);
        return;
    }

    if (strcmp(req.method, "OPTIONS") == 0) {
        // Il browser manda questa richiesta "di controllo" prima di un POST
        // con header personalizzati (X-File-Name) quando pagina e server
        // hanno origini diverse (es. pagina su :5173, server su :5000).
        send_no_body_response(client, 204, "No Content");
    } else if (strcmp(req.method, "GET") == 0) {
        serve_static_file(client, web_dir, req.path);
    } else if (strcmp(req.method, "POST") == 0 && strcmp(req.path, "/upload") == 0) {
        handle_upload(client, &req, upload_dir);
    } else {
        send_text_response(client, 404, "Not Found", "text/plain", "non trovato");
    }

    closesocket(client);
}
