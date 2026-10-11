#ifndef NETWORK_H
#define NETWORK_H

#include <winsock2.h>
#include <stdint.h>
#include <stddef.h>

#ifdef _MSC_VER
#pragma comment(lib, "ws2_32.lib")
#endif

int  net_init(void);      /* WSAStartup: 0 = ok */
void net_cleanup(void);   /* WSACleanup */

/* Inviano/ricevono ESATTAMENTE len byte (TCP puo' spezzarli). 0 = ok, -1 = errore */
int send_all(SOCKET s, const void *buf, size_t len);
int recv_all(SOCKET s, void *buf, size_t len);

/* Conversione big-endian (ordine di rete) per interi a 64 bit */
uint64_t to_be64(uint64_t v);
uint64_t from_be64(uint64_t v);

#endif
