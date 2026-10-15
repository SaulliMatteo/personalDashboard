#ifndef HTTPSERVER_H
#define HTTPSERVER_H

// Avvia il server usando public/ e received/ come cartelle relative alla
// directory corrente. Serve per la versione standalone server_http.exe.
int http_server_start(int port);

// Avvia il server usando cartelle esplicite. La versione Tauri usa questa
// funzione per passare le directory delle risorse e dei dati dell'app.
int http_server_start_with_dirs(int port, const char *web_dir, const char *upload_dir);

// Ferma il server attualmente in ascolto.
void http_server_stop(void);

#endif
