# Deployment Guide

## 1. SSL Certificate (certbot)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hyeyield.duckdns.org
```

Certbot will update `/etc/nginx/sites-available/` automatically.
Copy the nginx config:

```bash
sudo cp ~/hyeyield/nginx/hyeyield.conf /etc/nginx/sites-available/hyeyield
sudo ln -sf /etc/nginx/sites-available/hyeyield /etc/nginx/sites-enabled/hyeyield
sudo nginx -t && sudo systemctl reload nginx
```

## 2. React production build

```bash
cd ~/hyeyield/frontend
npm ci
npm run build
sudo mkdir -p /var/www/hyeyield
sudo cp -r dist/* /var/www/hyeyield/
```

## 3. systemd service

```bash
sudo cp ~/hyeyield/deploy/hyeyield.service /etc/systemd/system/hyeyield.service
sudo systemctl daemon-reload
sudo systemctl enable hyeyield
sudo systemctl start hyeyield
sudo systemctl status hyeyield
```

## 4. Remove old cron job (if any)

```bash
crontab -e
# Delete any line referencing auto_invest.py
```

## Test gates

- `https://hyeyield.duckdns.org` shows padlock in browser
- `http://hyeyield.duckdns.org` redirects to HTTPS automatically
- After `sudo reboot`: `systemctl status hyeyield` shows **active (running)**
- `sudo systemctl kill hyeyield` → restarts within 5 seconds
