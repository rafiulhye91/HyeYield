# Quick Deployment Guide

**Time Estimate**: 30-45 minutes  
**Downtime**: ~2 minutes

---

## Before You Start

✓ Read `IMPLEMENTATION_SUMMARY.md`  
✓ Backup current database  
✓ Generate new Jira API token  

---

## Step 1: Backup (2 minutes)

```bash
cd /Users/rafiulhye/Projects/HyeYield/hyeyield

# Backup database and config
cp hyeyield.db hyeyield.db.backup.$(date +%Y%m%d_%H%M%S)
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

echo "✓ Backups created"
```

---

## Step 2: Verify Secrets (1 minute)

```bash
# Check .env has new secrets
cat .env | grep -E "^(SECRET_KEY|ENCRYPT_KEY|JIRA_API_TOKEN)="

# Should show:
# SECRET_KEY=fad5838a...
# ENCRYPT_KEY=8oNZZ...
# JIRA_API_TOKEN=<REGENERATE_AT_...>
```

**If JIRA_API_TOKEN is missing**:
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create new token
3. Update `.env` JIRA_API_TOKEN value

---

## Step 3: Local Testing (10 minutes)

```bash
cd /Users/rafiulhye/Projects/HyeYield/hyeyield

# Activate venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create logs directory
mkdir -p logs

# Verify code compiles
python3 -c "from backend.main import app; print('✓ Backend ready')"

# Test backend
pytest backend/tests/test_auth.py -v -x

echo "✓ Backend tests passed"
```

---

## Step 4: Frontend Build (5 minutes)

```bash
cd /Users/rafiulhye/Projects/HyeYield/hyeyield/frontend

# Install dependencies
npm install

# Build optimized version
npm run build

# Verify build
test -d dist && echo "✓ Frontend built" || echo "✗ Build failed"
```

---

## Step 5: Deployment (5 minutes)

### On Your Local Machine (if code in git)

```bash
cd /Users/rafiulhye/Projects/HyeYield

# Verify no uncommitted changes (optional)
git status

# Create deployment tag (optional)
git tag deployment-$(date +%Y%m%d)
```

### On Production Server

```bash
ssh rafiulhye91@136.111.43.16

# Stop service
sudo systemctl stop hyeyield
echo "✓ Service stopped"

# Update code
cd ~/hyeyield
git pull origin main  # or copy files manually

# Install dependencies
source venv/bin/activate
pip install -r requirements.txt
echo "✓ Dependencies installed"

# Run migrations
alembic upgrade head
echo "✓ Migrations applied"

# Create logs directory
mkdir -p logs
chmod 750 logs

# Start service
sudo systemctl start hyeyield
echo "✓ Service started"

# Wait 3 seconds for startup
sleep 3

# Verify service
sudo systemctl status hyeyield

# Test health endpoint
curl -s https://hyeyield.duckdns.org/health | jq .

# Verify security headers
curl -I https://hyeyield.duckdns.org | grep -E "^(Strict-Transport|X-Frame|X-Content)"
```

---

## Step 6: Post-Deployment Verification (3 minutes)

```bash
ssh rafiulhye91@136.111.43.16

# Check logs for errors
tail -20 logs/audit.log

# Check systemd logs
journalctl -u hyeyield -n 20

# Test login endpoint
curl -X POST https://hyeyield.duckdns.org/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"wrong"}' \
  -i

# Should return 401, not 500

echo "✓ Deployment complete"
```

---

## Testing Checklist

### In Browser

1. **Register new account**
   - Go to https://hyeyield.duckdns.org/register
   - Create test account
   - Should redirect to dashboard

2. **Check cookies (not localStorage)**
   - Open DevTools (F12)
   - Application → Cookies
   - Should see: `access_token` (httpOnly), `refresh_token` (httpOnly)
   - Should NOT see token in localStorage

3. **Test CSRF protection**
   - Open DevTools → Network tab
   - Try to delete an account
   - POST should succeed (frontend sends CSRF token)
   - Logout and try again
   - Should fail (401 Unauthorized, not 403 CSRF)

4. **Verify security headers**
   - DevTools → Network → click any request → Response Headers
   - Should see: Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options

### Command Line

```bash
# Verify CSRF protection
curl -X POST https://hyeyield.duckdns.org/accounts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -i
# Should return: 403 CSRF token missing

# Verify rate limiting
for i in {1..6}; do
  curl -X POST https://hyeyield.duckdns.org/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"user","password":"pass"}' \
    -s -w "%{http_code}\n" -o /dev/null
done
# First 5: 401 (invalid credentials)
# 6th: 429 (rate limited)

# Verify audit logging
tail -10 /home/rafiulhye91/hyeyield/logs/audit.log | jq .
# Should see JSON-formatted events
```

---

## Rollback (If Issues)

```bash
ssh rafiulhye91@136.111.43.16

# Stop service
sudo systemctl stop hyeyield

# Restore backup
cp ~/hyeyield/hyeyield.db.backup.LATEST ~/hyeyield/hyeyield.db
cp ~/hyeyield/.env.backup.LATEST ~/hyeyield/.env

# Start service
sudo systemctl start hyeyield

# Verify
curl -s https://hyeyield.duckdns.org/health | jq .

echo "✓ Rolled back"
```

---

## Troubleshooting

### Service won't start
```bash
journalctl -u hyeyield -n 50
# Check for:
# - Import errors
# - Missing .env values
# - Database locked
```

### 401 errors everywhere
```bash
# Check .env has correct SECRET_KEY and ENCRYPT_KEY
cat ~/.env | grep -E "^(SECRET_KEY|ENCRYPT_KEY)="

# Restart service if changed
sudo systemctl restart hyeyield
```

### CSRF failures
```bash
# Ensure frontend is rebuilt
cd ~/hyeyield/frontend
npm run build

# Restart nginx
sudo systemctl restart nginx
```

### Audit logs missing
```bash
# Check logs directory exists and is writable
ls -ld ~/hyeyield/logs

# Check permissions
ls -l ~/hyeyield/logs/

# Should be: drwxr-x--- with owner rafiulhye91
```

---

## Monitoring

### Watch for these

```bash
# Real-time log monitoring
tail -f /home/rafiulhye91/hyeyield/logs/audit.log

# Look for:
# - UNUSUAL activity (AUTHZ_FAILURE, CSRF_FAILURE)
# - ERROR or EXCEPTION logs
# - Service restarts

# Check service status
systemctl is-active hyeyield

# Monitor error logs
journalctl -u hyeyield -f

# Check disk space
df -h /home/rafiulhye91/hyeyield/
```

---

## Done ✓

Your HyeYield instance is now hardened against:
- ✓ XSS token theft
- ✓ CSRF attacks  
- ✓ Unauthorized access
- ✓ Information disclosure

**Keep monitoring logs and test regularly.**

---

## Need Help?

1. Check `IMPLEMENTATION_SUMMARY.md` for details
2. Review `SECURITY_FIXES_DEPLOYED.md` for troubleshooting
3. Check logs: `tail -100 logs/audit.log`
4. Verify `.env` has all required secrets

