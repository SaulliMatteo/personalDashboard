#ifndef HTTP_H
#define HTTP_H

#include "platform.h"

#define HTTP_MAX_PATH   512
#define HTTP_MAX_NAME   256

// Una richiesta HTTP "capita al minimo indispensabile": ci interessano
// solo il metodo, il percorso e due header (Content-Length e X-File-Name).
// Tutto il resto degli header viene letto e scartato.
typedef struct {
    char method[8];               // "GET", "POST", "OPTIONS"
    char path[HTTP_MAX_PATH];     // es. "/", "/upload", "/assets/app.js"
    long long content_length;     // -1 se assente o non valido
    char file_name[HTTP_MAX_NAME];// da X-File-Name, decodificato; "" se assente
    int has_file_name;            // c'era l'header X-File-Name
    char host[HTTP_MAX_NAME];     // header Host, "" se assente
    char origin[HTTP_MAX_NAME];   // header Origin, "" se assente
} http_request;

// Legge riga di richiesta + header dal socket. 0 = ok, -1 = errore/connessione chiusa.
int http_parse_request(SOCKET s, http_request *req);

// Gestisce una connessione già accettata dall'inizio alla fine (chiude il socket lei stessa).
void http_handle_client(SOCKET client, const char *web_dir, const char *upload_dir);

#endif
