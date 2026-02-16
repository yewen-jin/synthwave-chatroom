- **Node/Express chat app** managed by **PM2** on the host (listening on a private port like `3000`)
- **nginx-proxy + acme-companion** in Docker for automatic vhosts + HTTPS
- An **app-specific “web” container** (nginx:alpine) that nginx-proxy routes to by domain, and that container **proxies internally** to your host app on `host.docker.internal:3000`
- **UFW firewall** blocks `:3000` from the public internet, but still allows Docker-to-host access

---

# VPS Chat App Deployment Manual (PM2 + nginx-proxy + Let’s Encrypt)

## 0. What this setup does

### Goals

- Serve the chat app on a friendly URL like:
  - `https://chat.datadadaist.space/roomname`

- Keep the app’s internal port (`3000`) **not publicly accessible**
- Auto-restart app if it crashes (PM2)
- Automatically get/renew HTTPS certs (acme-companion)

### High-level architecture

```
Browser
  |
  |  HTTPS (443) / HTTP (80)
  v
[nginx-proxy container]  <-- chooses target by Host header (domain)
  |
  v
[chatroom-web container (nginx)]  <-- your per-app container
  |
  |  internal proxy to host
  v
[Node/Express app on host :3000]  <-- managed by PM2
```

---

## 1. Prerequisites

### On the server

- Docker + Docker Compose plugin
- Node.js + npm
- A non-root user with SSH access
- UFW enabled (optional but recommended)

### DNS

- You control DNS for the domain (Route 53 or similar).
- You can create an **A record** for a subdomain pointing to your VPS IP.

> DNS **never** includes ports. You can’t point DNS to `IP:3000`. Only `IP`.

---

## 2. Directory layout (recommended)

### Reverse proxy stack

`/srv/reverse-proxy/`

```
/srv/reverse-proxy/
  docker-compose.yml
  nginx-config/
    chatroom-web.conf
    (other-app.conf)
```

### App code

Example:
`~/voidspace/Void-Space-Chatroom/`

---

## 3. DNS setup (Route 53 example)

For `chat.datadadaist.space`:

- Create an **A record**
  - Name: `chat`
  - Value: `<your server IPv4>`
  - TTL: default (e.g. 300)

Wait for DNS to propagate. Verify:

```bash
dig +short chat.datadadaist.space
```

---

## 4. Firewall model (UFW)

### What we want

- Public internet can access: **80, 443**
- Public internet cannot access: **3000**
- Docker containers **can** still reach host port **3000** for internal proxying

### Open 80/443

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### Block port 3000 only on the public interface

Find public interface:

```bash
ip -o -4 route show to default | awk '{print $5; exit}'
```

This prints something like `eth0`, `ens3`, or `vm-...`.

Then:

```bash
sudo ufw deny in on <PUBLIC_IF> to any port 3000 proto tcp
```

> Do **not** use `sudo ufw deny 3000/tcp` globally, because that can block Docker containers from reaching your host and cause 504 timeouts.

### Allow Docker bridge → host:3000 (if needed)

If your app proxy uses `host.docker.internal` and it resolves to `172.17.0.1`, allow the Docker bridge subnet:

```bash
sudo ufw allow from 172.17.0.0/16 to any port 3000 proto tcp
```

Check rules:

```bash
sudo ufw status numbered
```

---

## 5. Host app: run Node with PM2

### Install PM2 (no sudo global install)

If you can’t `sudo npm`, install PM2 globally into your home prefix:

```bash
mkdir -p ~/.npm-global
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

npm i -g pm2
```

### Start the app with PM2

From your app folder:

```bash
cd ~/voidspace/Void-Space-Chatroom
pm2 start npm --name voidspace -- start
pm2 save
```

Optional safety limit (restart if memory balloons):

```bash
pm2 restart voidspace
pm2 delete voidspace
pm2 start npm --name voidspace --max-memory-restart 350M -- start
pm2 save
```

### Confirm it’s listening

```bash
curl -I http://127.0.0.1:3000/
ss -ltnp | grep :3000
pm2 status
```

---

## 6. Reverse proxy: docker-compose (nginx-proxy + acme + app web container)

This assumes you’re using the `nginxproxy/nginx-proxy` + `nginxproxy/acme-companion` pattern and your proxy network is called `proxy`.

### `/srv/reverse-proxy/docker-compose.yml` (template)

```yaml
services:
  nginx-proxy:
    image: nginxproxy/nginx-proxy
    container_name: nginx-proxy
    restart: unless-stopped
    networks: [proxy]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/nginx/html
      - dhparam:/etc/nginx/dhparam

  acme-companion:
    image: nginxproxy/acme-companion
    container_name: acme-companion
    restart: unless-stopped
    networks: [proxy]
    depends_on: [nginx-proxy]
    environment:
      DEFAULT_EMAIL: "hello@yewenjin.com"
      NGINX_PROXY_CONTAINER: "nginx-proxy"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/nginx/html
      - acme:/etc/acme.sh

  chatroom-web:
    image: nginx:alpine
    container_name: chatroom-web
    restart: unless-stopped
    networks: [proxy]
    environment:
      VIRTUAL_HOST: chat.datadadaist.space
      LETSENCRYPT_HOST: chat.datadadaist.space
      LETSENCRYPT_EMAIL: hello@yewenjin.com
    volumes:
      - ./nginx-config/chatroom-web.conf:/etc/nginx/conf.d/default.conf:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"

networks:
  proxy:

volumes:
  certs:
  vhost:
  html:
  dhparam:
  acme:
```

### `/srv/reverse-proxy/nginx-config/chatroom-web.conf` (Option A: proxy everything to Node)

This is the simplest and matches “`:3000 works, so just front it with a domain”.

```nginx
server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://host.docker.internal:3000;
    proxy_http_version 1.1;

    # WebSockets
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Standard headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Helpful for long-lived connections
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

### Bring the proxy stack up

```bash
cd /srv/reverse-proxy
sudo docker compose up -d
sudo docker compose ps
```

Watch certificate issuance:

```bash
sudo docker logs -f acme-companion
```

---

## 7. Restart / reload commands

### Restart Node app (PM2)

```bash
pm2 restart voidspace
```

If you changed env vars:

```bash
pm2 restart voidspace --update-env
```

### Restart reverse proxy containers

From `/srv/reverse-proxy`:

```bash
sudo docker compose up -d
```

Force restart a specific container:

```bash
sudo docker compose restart nginx-proxy
sudo docker compose restart chatroom-web
```

---

## 8. Updating / redeploying the app

Typical flow:

```bash
cd ~/voidspace/Void-Space-Chatroom
git pull
npm install
npm run build   # only if your app requires build steps
pm2 restart voidspace
```

If your app is pure Node/Express serving HTML directly, you might not need `npm run build`.

---

## 9. Adding another domain (same app)

If you want the same app to respond to multiple hostnames, comma-separate:

```yaml
environment:
  VIRTUAL_HOST: chat.datadadaist.space,another.example.com
  LETSENCRYPT_HOST: chat.datadadaist.space,another.example.com
```

Then:

```bash
cd /srv/reverse-proxy
sudo docker compose up -d
sudo docker logs -f acme-companion
```

---

## 10. Adding another app on the same server

### Rule

Only one app can use port 3000. Give each app its own port:

- chat app: 3000
- blog app: 4000
- admin app: 5000

Start with PM2:

```bash
PORT=4000 pm2 start npm --name blog -- start
pm2 save
```

Add a new `blog-web` container with:

- `VIRTUAL_HOST=blog.yewenjin.com`
- config proxying to `host.docker.internal:4000`

---

## 11. Troubleshooting

### A) 502 Bad Gateway

Meaning: proxy reached the container, but upstream refused/errored.

Check:

```bash
pm2 status
curl -I http://127.0.0.1:3000/
sudo docker logs --tail=200 chatroom-web
sudo docker logs --tail=200 nginx-proxy
```

### B) 504 Gateway Time-out

Meaning: upstream is not reachable (packets dropped / firewall / routing).

Confirm host is listening:

```bash
ss -ltnp | grep :3000
curl -I --max-time 2 http://127.0.0.1:3000/
```

Confirm container can reach host:

```bash
docker exec -it chatroom-web sh -lc 'getent hosts host.docker.internal; wget -qO- --timeout=2 http://host.docker.internal:3000/ | head -n 2'
```

If wget times out → fix UFW (deny only on public interface; allow Docker subnet).

### C) HTTPS not working

Usually one of:

- DNS not pointing to the server IP
- ports 80/443 blocked
- Let’s Encrypt waiting/failing

Check:

```bash
dig +short chat.datadadaist.space
sudo ufw status
sudo docker logs -f acme-companion
```

### D) “It works on :3000 but not on domain”

Usually:

- Your `chatroom-web.conf` points to wrong upstream port
- Firewall blocks Docker → host
- App not running under PM2 (port 3000 not listening)

### E) WebSocket / interaction drops mid-performance

Make sure:

- Upgrade headers set (in nginx config)
- `proxy_read_timeout`/`proxy_send_timeout` long enough
- Client reconnect logic exists (app-level)

---

## 12. Notes on “memory jumped after restart”

PM2 “Mem” is RSS (OS-level resident memory), not just JS heap. It’s normal for Node RSS to jump after restart + first traffic. PM2’s `monit` panel shows heap separately; use that for “is my app leaking?” checks.

---

If you want, paste your current `/srv/reverse-proxy/docker-compose.yml` and the `chatroom-web.conf` you’re using now, and I’ll tailor this README so it matches your exact filenames, service names, and the firewall rules you actually ended up with.
