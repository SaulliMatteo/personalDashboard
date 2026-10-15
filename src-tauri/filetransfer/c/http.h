#ifndef HTTP_H
#define HTTP_H

#include <winsock2.h>

#define HTTP_MAX_PATH   512
#define HTTP_MAX_NAME   256

// Una richiesta HTTP "capita al minimo indispensabile": ci interessano
// solo il metodo, il percorso e due header (Content-Length e X-File-Name).
// Tutto il resto degli header viene letto e scartato.
typedef struct {
    char method[8];               // "GET", "POST", "OPTIONS"
    char path[HTTP_MAX_PATH];     // es. "/", "/upload", "/assets/app.js"
    long content_length;          // -1 se assente
    char file_name[HTTP_MAX_NAME];// da X-File-Name, decodificato; "" se assente
} http_request;

// Legge riga di richiesta + header dal socket. 0 = ok, -1 = errore/connessione chiusa.
int http_parse_request(SOCKET s, http_request *req);

// Gestisce una connessione già accettata dall'inizio alla fine (chiude il socket lei stessa).
void http_handle_client(SOCKET client, const char *web_dir, const char *upload_dir);

#endif
