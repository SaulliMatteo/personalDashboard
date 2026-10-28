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
#include <errno.h>

#define LINE_MAX_LEN   4096
#define CHUNK          65536
/* Oltre questi header la richiesta si scarta (nessun browser ne manda tanti). */
#define MAX_HEADERS    100
/* File più grande accettato: 64 GB, solo per non riempire il disco con un Content-Length assurdo. */
#define MAX_UPLOAD     (64LL * 1024 * 1024 * 1024)

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

// Nomi riservati di Windows (anche con un'estensione: "CON.txt" apre la console).
static int is_reserved_name(const char *name) {
    static const char *reserved[] = { "CON", "PRN", "AUX", "NUL", "COM", "LPT" };
    size_t base = strcspn(name, ".");
    for (size_t i = 0; i < sizeof(reserved) / sizeof(reserved[0]); i++) {
        size_t len = strlen(reserved[i]);
        if (base < len) continue;
        int same = 1;
        for (size_t k = 0; k < len; k++)
            if (toupper((unsigned char)name[k]) != reserved[i][k]) { same = 0; break; }
        if (!same) continue;
        if (i < 4 && base == len) return 1;                                           // CON, PRN, AUX, NUL
        if (i >= 4 && base == len + 1 && isdigit((unsigned char)name[len])) return 1; // COM1, LPT9…
    }
    return 0;
}

// Un nome file non deve poter far scrivere fuori dalla cartella di destinazione, né su un dispositivo.
static int name_is_safe(const char *name) {
    size_t len = strlen(name);
    if (len == 0) return 0;
    if (strstr(name, "..")) return 0;
    if (strpbrk(name, "\\/:*?\"<>|")) return 0;
    for (size_t i = 0; i < len; i++)
        if ((unsigned char)name[i] < 0x20 || name[i] == 0x7f) return 0;
    if (name[len - 1] == '.' || name[len - 1] == ' ') return 0; // Windows li toglierebbe da solo
    if (is_reserved_name(name)) return 0;
    return 1;
}

// Copia un header in un campo a dimensione fissa (troncato).
static void copy_header(char *dst, size_t dst_size, const char *value) {
    strncpy(dst, value, dst_size - 1);
    dst[dst_size - 1] = '\0';
}

// Host accettati: un indirizzo IPv4 o "localhost", con la porta. Un nome di dominio qualsiasi vorrebbe dire
// che la richiesta arriva da una pagina web che ha fatto puntare il suo dominio qui (DNS rebinding).
static int host_is_allowed(const char *host) {
    if (host[0] == '\0') return 0;
    if (strncmp(host, "localhost", 9) == 0 && (host[9] == '\0' || host[9] == ':')) return 1;
    for (const char *p = host; *p; p++)
        if (!isdigit((unsigned char)*p) && *p != '.' && *p != ':') return 0;
    return 1;
}

// Se il browser dice da dove arriva la richiesta, deve essere la pagina servita da qui (stessa origine):
// un altro sito aperto nel browser non può mandare file.
static int origin_is_allowed(const http_request *req) {
    if (req->origin[0] == '\0') return 1;
    char expected[HTTP_MAX_NAME + 8];
    snprintf(expected, sizeof(expected), "http://%s", req->host);
    return strcmp(req->origin, expected) == 0;
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
    req->has_file_name = 0;
    req->host[0] = '\0';
    req->origin[0] = '\0';

    for (int count = 0;; count++) {
        if (count > MAX_HEADERS) return -1;
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
            char *end;
            errno = 0;
            long long v = strtoll(value, &end, 10);
            req->content_length = (errno == 0 && end != value && *end == '\0' && v >= 0) ? v : -1;
        } else if (ci_equal(name, "X-File-Name")) {
            url_decode(value, req->file_name, sizeof(req->file_name));
            req->has_file_name = 1;
        } else if (ci_equal(name, "Host")) {
            copy_header(req->host, sizeof(req->host), value);
        } else if (ci_equal(name, "Origin")) {
            copy_header(req->origin, sizeof(req->origin), value);
        }
    }
    return 0;
}

// ---------- invio delle risposte ----------

// Riga di stato. Niente header CORS: la pagina dell'iPad è servita da qui (stessa origine), e un'altra pagina
// web aperta nel browser non deve poter mandare file.
static void send_status(SOCKET s, int code, const char *status_text) {
    char header[256];
    snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "X-Content-Type-Options: nosniff\r\n",
        code, status_text);
    send_all(s, header, strlen(header));
}

static void send_text_response(SOCKET s, int code, const char *status_text,
                                const char *content_type, const char *body) {
    send_status(s, code, status_text);
    size_t body_len = strlen(body);
    char header[128];
    snprintf(header, sizeof(header),
        "Content-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
        content_type, body_len);
    send_all(s, header, strlen(header));
    send_all(s, body, body_len);
}

static void send_no_body_response(SOCKET s, int code, const char *status_text) {
    send_status(s, code, status_text);
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
    // solo percorsi dentro la cartella della pagina ("/", "/assets/…"), senza "?…" e senza separatori di Windows
    char clean[HTTP_MAX_PATH];
    snprintf(clean, sizeof(clean), "%.*s", (int)strcspn(req_path, "?#"), req_path);
    if (clean[0] != '/' || strstr(clean, "..") || strpbrk(clean, "\\:")) {
        send_text_response(s, 400, "Bad Request", "text/plain", "percorso non valido");
        return;
    }

    char full_path[1024];
    if (strcmp(clean, "/") == 0)
        snprintf(full_path, sizeof(full_path), "%s/index.html", web_dir);
    else
        snprintf(full_path, sizeof(full_path), "%s%s", web_dir, clean);

    FILE *f = fopen(full_path, "rb");
    if (!f) {
        send_text_response(s, 404, "Not Found", "text/plain", "pagina non trovata");
        return;
    }

    file_seek(f, 0, SEEK_END);
    uint64_t size = (uint64_t)file_tell(f);
    file_seek(f, 0, SEEK_SET);

    send_status(s, 200, "OK");
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

// Apre un file nuovo senza mai sovrascriverne uno: "foto.jpg", poi "foto (1).jpg", "foto (2).jpg"…
// In `name` resta il nome usato. NULL se non si riesce.
static FILE *open_new_file(const char *dir, char *name, size_t name_size, char *full_path, size_t path_size) {
    const char *dot = strrchr(name, '.');
    int base_len = (int)((dot && dot != name) ? (size_t)(dot - name) : strlen(name));
    const char *ext = name + base_len;
    // spazio per " (999)" + estensione: la base si accorcia se serve
    int max_base = (int)name_size - 8 - (int)strlen(ext);
    if (max_base < 1) return NULL;
    if (base_len > max_base) base_len = max_base;

    for (int i = 0; i < 1000; i++) {
        char candidate[HTTP_MAX_NAME];
        if (i == 0) snprintf(candidate, sizeof(candidate), "%s", name);
        else snprintf(candidate, sizeof(candidate), "%.*s (%d)%s", base_len, name, i, ext);
        snprintf(full_path, path_size, "%s/%s", dir, candidate);
        errno = 0;
        FILE *f = fopen(full_path, "wbx"); // "x": fallisce se il file esiste già
        if (f) {
            snprintf(name, name_size, "%s", candidate);
            return f;
        }
        if (errno != EEXIST) return NULL;
    }
    return NULL;
}

static void handle_upload(SOCKET s, const http_request *req, const char *upload_dir) {
    // Con X-File-Name il browser fa sempre il controllo preventivo (preflight) per un'altra origine: senza, una
    // pagina di un altro sito potrebbe mandare un file con una richiesta "semplice".
    if (!req->has_file_name) {
        send_text_response(s, 400, "Bad Request", "text/plain", "X-File-Name mancante");
        return;
    }
    if (req->content_length < 0) {
        send_text_response(s, 400, "Bad Request", "text/plain", "Content-Length mancante");
        return;
    }
    if (req->content_length > MAX_UPLOAD) {
        send_text_response(s, 413, "Payload Too Large", "text/plain", "file troppo grande");
        return;
    }

    char file_name[HTTP_MAX_NAME];
    snprintf(file_name, sizeof(file_name), "%s", name_is_safe(req->file_name) ? req->file_name : "upload.bin");

    make_dir(upload_dir);
    char full_path[1024];
    FILE *f = open_new_file(upload_dir, file_name, sizeof(file_name), full_path, sizeof(full_path));
    if (!f) {
        send_text_response(s, 500, "Internal Server Error", "text/plain", "impossibile creare il file");
        return;
    }

    printf("Ricevo '%s' (%lld byte)\n", file_name, req->content_length);

    char buf[CHUNK];
    long long remaining = req->content_length;
    int ok = 1;
    while (remaining > 0) {
        int want = remaining > CHUNK ? CHUNK : (int)remaining;
        int n = recv(s, buf, want, 0);
        if (n <= 0) { ok = 0; break; }
        if (fwrite(buf, 1, (size_t)n, f) != (size_t)n) { ok = 0; break; }
        remaining -= n;
    }
    if (fclose(f) != 0) ok = 0;

    if (!ok) {
        remove(full_path); // niente file a metà tra quelli ricevuti
        send_text_response(s, 500, "Internal Server Error", "text/plain", "trasferimento interrotto");
        return;
    }

    char body[512];
    snprintf(body, sizeof(body), "{\"status\":\"ok\",\"name\":\"%s\",\"size\":%lld}", file_name, req->content_length);
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

    if (!host_is_allowed(req.host) || !origin_is_allowed(&req)) {
        send_text_response(client, 403, "Forbidden", "text/plain", "origine non ammessa");
    } else if (strcmp(req.method, "OPTIONS") == 0) {
        // Controllo preventivo di un'altra origine: risposta senza header CORS, quindi il browser blocca il POST.
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
