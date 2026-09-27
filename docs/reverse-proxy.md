# Reverse proxy setup

RadTempo's `app` container listens on internal HTTP port `3000` (configurable via `PORT`). It is never exposed directly to the internet by default — you put a reverse proxy in front of it to terminate TLS and forward requests.

Whichever proxy you use, set `APP_URL` in `.env` to the public **https** URL that visitors will use (e.g. `https://radtempo.example.com`). This is used to build absolute links and validate auth request origins, so it must match exactly, including scheme.

RadTempo does not use WebSockets, so no special upgrade/connection headers are required for real-time functionality — standard HTTP reverse-proxying is sufficient.

## Option 1: Bundled Caddy (recommended for most self-hosters)

The simplest path. Set `DOMAIN` in `.env` to your public hostname, then run:

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Caddy automatically requests and renews a TLS certificate for `DOMAIN` and proxies traffic to the `app` container. The overlay mounts `docker/Caddyfile` (a copy of the `Caddyfile.example` template in the repository root) and also removes the `app` service's direct host port publication, since Caddy is now the only thing exposed on the host. This requires Docker Compose >= 2.24 (for the `!reset` merge operator).

## Option 2: Your own existing Caddy instance

If you already run Caddy for other sites, add a site block pointing at the `app` container (or the host port you've mapped to it):

```caddyfile
radtempo.example.com {
    reverse_proxy app:3000
}
```

Do not also run the bundled `docker-compose.caddy.yml` in this case — use only `docker-compose.yml`, and connect your existing Caddy instance to the same Docker network, or to whatever host port you expose from the `app` service.

## Option 3: Nginx

```nginx
server {
    listen 443 ssl;
    server_name radtempo.example.com;

    ssl_certificate     /etc/letsencrypt/live/radtempo.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/radtempo.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP          $remote_addr;
        proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto   $scheme;
    }
}
```

Forwarding `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host` is required so RadTempo generates correct absolute URLs and can apply login rate limiting against the real client IP. WebSocket upgrade headers (`Upgrade` / `Connection`) are not needed — RadTempo has no real-time features that require them.

## Option 4: Traefik

Using Docker labels on the `app` service:

```yaml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.radtempo.rule=Host(`radtempo.example.com`)"
      - "traefik.http.routers.radtempo.entrypoints=websecure"
      - "traefik.http.routers.radtempo.tls.certresolver=letsencrypt"
      - "traefik.http.services.radtempo.loadbalancer.server.port=3000"
```

Traefik passes `X-Forwarded-*` headers by default, so no additional header configuration is normally needed.

## Checklist

- [ ] `APP_URL` matches the public https URL exactly.
- [ ] The proxy forwards `Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`.
- [ ] `postgres` remains unreachable from outside the Docker network.
- [ ] Only one reverse proxy is in front of the app (don't run the bundled Caddy alongside your own proxy).
