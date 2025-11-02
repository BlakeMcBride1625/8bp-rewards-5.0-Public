# Cloudflare Tunnel Setup

## Overview

Cloudflare Tunnel provides secure, SSL-terminated access to your application without exposing ports or requiring firewall configuration.

## Quick Setup

Use the automated setup script:

```bash
./scripts/setup-new-cloudflare-tunnel.sh
```

This script will:
1. Check for cloudflared installation
2. Create a new tunnel
3. Configure DNS routing
4. Set up systemd service
5. Start the tunnel

## Manual Setup

### 1. Install cloudflared

```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

Select your domain when prompted.

### 3. Create Tunnel

```bash
cloudflared tunnel create 8bp-rewards-tunnel
```

### 4. Configure DNS

```bash
cloudflared tunnel route dns 8bp-rewards-tunnel 8bp.epildevconnect.uk
```

### 5. Get Tunnel UUID

```bash
cloudflared tunnel list
```

Note the UUID for the tunnel.

### 6. Configure Tunnel

Edit `~/.cloudflared/config.yml`:

```yaml
tunnel: 8bp-rewards-tunnel
credentials-file: /home/blake/.cloudflared/TUNNEL_UUID.json

ingress:
  - hostname: 8bp.epildevconnect.uk
    service: http://localhost:2600
    originRequest:
      httpHostHeader: 8bp.epildevconnect.uk
      noHappyEyeballs: true
  - service: http_status:404
```

Replace `TUNNEL_UUID` with your actual tunnel UUID.

### 7. Setup Systemd Service

```bash
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for 8BP Rewards
After=network.target

[Service]
Type=simple
User=blake
ExecStart=/usr/bin/cloudflared tunnel --config $HOME/.cloudflared/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### 8. Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-tunnel.service
sudo systemctl start cloudflared-tunnel.service
```

## Configuration

### Consolidated Setup

With the consolidated Docker setup, all traffic (frontend + backend) goes to port 2600:
- Frontend is served from backend container under `/8bp-rewards` route
- API endpoints are under `/8bp-rewards/api/*`
- Single tunnel entry point simplifies routing

### Tunnel Config Template

See `cloudflare-tunnel.yml` for the template configuration.

## Management

### Check Status

```bash
sudo systemctl status cloudflared-tunnel.service
```

### View Logs

```bash
sudo journalctl -u cloudflared-tunnel.service -f
```

### Restart

```bash
sudo systemctl restart cloudflared-tunnel.service
```

### Stop

```bash
sudo systemctl stop cloudflared-tunnel.service
```

## Troubleshooting

### Tunnel Not Connecting

1. Check service status: `sudo systemctl status cloudflared-tunnel.service`
2. Verify config file exists: `cat ~/.cloudflared/config.yml`
3. Check credentials file: `ls -la ~/.cloudflared/*.json`
4. Validate config: `cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate`

### DNS Not Resolving

1. Verify DNS route: `cloudflared tunnel route dns list`
2. Check domain DNS settings in Cloudflare dashboard
3. Wait for DNS propagation (can take a few minutes)

### Backend Not Accessible

1. Verify backend is running: `docker-compose ps` or check backend service
2. Test locally: `curl http://localhost:2600/api/status`
3. Check tunnel logs for connection errors

## Updating Tunnel

If you need to recreate the tunnel:

1. Stop service: `sudo systemctl stop cloudflared-tunnel.service`
2. Delete old tunnel: `cloudflared tunnel delete 8bp-rewards-tunnel`
3. Run setup script again: `./scripts/setup-new-cloudflare-tunnel.sh`

