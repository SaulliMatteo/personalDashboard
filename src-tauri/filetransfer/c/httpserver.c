#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#ifndef _WINSOCK_DEPRECATED_NO_WARNINGS
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#endif

#include "httpserver.h"
#include "network.h"
#include "http.h"

#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <process.h>
#include <stdint.h>
#include <string.h>

#define DEFAULT_WEB_DIR    "public"
#define DEFAULT_UPLOAD_DIR "received"
#define PATH_MAX_LEN       1024

static SOCKET g_listen_socket = INVALID_SOCKET;
static HANDLE g_accept_thread = NULL;
static char g_web_dir[PATH_MAX_LEN] = DEFAULT_WEB_DIR;
static char g_upload_dir[PATH_MAX_LEN] = DEFAULT_UPLOAD_DIR;

typedef struct {
    SOCKET client;
} client_args;

static int copy_dir(char *dst, size_t dst_size, const char *src) {
    if (!src || src[0] == '\0') return -1;

    /* Tauri su Windows puo' passare percorsi "verbatim" (\\?\C:\...):
       in quel formato '/' non viene convertito in '\', quindi lo tolgo. */
    if (strncmp(src, "\\\\?\\", 4) == 0) src += 4;

    size_t len = strlen(src);
    if (len >= dst_size) return -1;
    memcpy(dst, src, len + 1);
    return 0;
}

static unsigned __stdcall client_thread(void *arg) {
    client_args *args = (client_args *)arg;
    SOCKET client = args->client;
    free(args);
    http_handle_client(client, g_web_dir, g_upload_dir);
    return 0;
}

static unsigned __stdcall accept_loop(void *arg) {
    SOCKET srv = (SOCKET)(uintptr_t)arg;

    for (;;) {
        struct sockaddr_in cli;
        int len = sizeof(cli);
        SOCKET c = accept(srv, (struct sockaddr *)&cli, &len);
        if (c == INVALID_SOCKET) {
            int error = WSAGetLastError();
            if (error == WSAENOTSOCK || error == WSAEINVAL || error == WSAECONNABORTED) break;
            continue;
        }

        client_args *args = malloc(sizeof(client_args));
        if (!args) {
            closesocket(c);
            continue;
        }
        args->client = c;

        HANDLE h = (HANDLE)_beginthreadex(NULL, 0, client_thread, args, 0, NULL);
        if (h) {
            CloseHandle(h);
        } else {
            free(args);
            closesocket(c);
        }
    }
    return 0;
}

int http_server_start_with_dirs(int port, const char *web_dir, const char *upload_dir) {
    if (port <= 0 || port > 65535) return -1;
    if (copy_dir(g_web_dir, sizeof(g_web_dir), web_dir) != 0) return -1;
    if (copy_dir(g_upload_dir, sizeof(g_upload_dir), upload_dir) != 0) return -1;

    if (net_init() != 0) return -1;

    SOCKET srv = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (srv == INVALID_SOCKET) {
        net_cleanup();
        return -1;
    }

    BOOL yes = TRUE;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof(yes));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons((u_short)port);

    if (bind(srv, (struct sockaddr *)&addr, sizeof(addr)) == SOCKET_ERROR) {
        closesocket(srv);
        net_cleanup();
        return -1;
    }

    if (listen(srv, 16) == SOCKET_ERROR) {
        closesocket(srv);
        net_cleanup();
        return -1;
    }

    g_listen_socket = srv;
    g_accept_thread = (HANDLE)_beginthreadex(NULL, 0, accept_loop, (void *)(uintptr_t)srv, 0, NULL);
    if (!g_accept_thread) {
        closesocket(srv);
        g_listen_socket = INVALID_SOCKET;
        net_cleanup();
        return -1;
    }

    return 0;
}

int http_server_start(int port) {
    return http_server_start_with_dirs(port, DEFAULT_WEB_DIR, DEFAULT_UPLOAD_DIR);
}

void http_server_stop(void) {
    if (g_listen_socket != INVALID_SOCKET) {
        closesocket(g_listen_socket);
        g_listen_socket = INVALID_SOCKET;
    }

    if (g_accept_thread) {
        WaitForSingleObject(g_accept_thread, 2000);
        CloseHandle(g_accept_thread);
        g_accept_thread = NULL;
    }

}
