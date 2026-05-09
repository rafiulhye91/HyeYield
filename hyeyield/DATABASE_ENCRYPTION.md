# Database Encryption at Rest

This guide enables SQLite database encryption using SQLCipher for additional security.

## Option 1: SQLCipher (Recommended)

SQLCipher encrypts the entire database file at the operating system level.

### Installation

1. Install SQLCipher:
```bash
# macOS
brew install sqlcipher

# Linux (Ubuntu/Debian)
sudo apt-get install sqlcipher libsqlcipher-dev

# Linux (Fedora)
sudo dnf install sqlcipher sqlcipher-devel
```

2. Install Python bindings:
```bash
cd /Users/rafiulhye/Projects/HyeYield/hyeyield
source venv/bin/activate
pip install sqlcipher3-binary
```

3. Update `backend/database.py`:
```python
from sqlalchemy.ext.asyncio import create_async_engine

# Generate a strong encryption key
import secrets
ENCRYPTION_KEY = secrets.token_hex(32)  # Store in .env as DATABASE_ENCRYPTION_KEY

DATABASE_URL = f"sqlite+pysqlcipher:///{DATABASE_PATH}?cipher=aes&key={ENCRYPTION_KEY}"
engine = create_async_engine(DATABASE_URL, echo=False)
```

4. Update `.env`:
```bash
DATABASE_ENCRYPTION_KEY=<YOUR_32_BYTE_HEX_KEY>
```

### Migration from Unencrypted Database

If migrating an existing database:

```bash
# Backup current database
cp hyeyield.db hyeyield.db.backup

# Create encrypted copy
python3 << 'EOF'
import sqlite3
from pysqlcipher3 import dbapi2 as sqlcipher
import secrets

# Generate key
key = secrets.token_hex(32)
print(f"DATABASE_ENCRYPTION_KEY={key}")

# Open unencrypted database
unencrypted_db = sqlite3.connect('hyeyield.db.backup')
unencrypted_db.backup(sqlcipher.connect(':memory:'))

# Dump and re-import with encryption
with unencrypted_db:
    backup = unencrypted_db.iterdump()
    
encrypted_db = sqlcipher.connect('hyeyield.db.encrypted')
encrypted_db.execute(f"PRAGMA key = '{key}'")
encrypted_db.executescript('\n'.join(backup))
encrypted_db.commit()

# Verify encrypted database works
encrypted_db.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = encrypted_db.fetchall()
print(f"Encrypted database has {len(tables)} tables ✓")

encrypted_db.close()
unencrypted_db.close()

# Replace original with encrypted version
import os
os.rename('hyeyield.db.encrypted', 'hyeyield.db')
print("Database encrypted successfully")
EOF
```

---

## Option 2: Full-Disk Encryption (Linux)

For production servers, use dm-crypt + LUKS for file-system level encryption.

### Setup on Linux Server

```bash
# Create encrypted volume
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 hyeyield_data

# Create filesystem
sudo mkfs.ext4 /dev/mapper/hyeyield_data

# Mount it
sudo mkdir -p /mnt/hyeyield
sudo mount /dev/mapper/hyeyield_data /mnt/hyeyield
sudo chown rafiulhye:rafiulhye /mnt/hyeyield

# Move database
sudo mv /home/rafiulhye/hyeyield/hyeyield.db /mnt/hyeyield/
sudo ln -s /mnt/hyeyield/hyeyield.db /home/rafiulhye/hyeyield/hyeyield.db

# Unlock on boot
echo "hyeyield_data /dev/sdb1 none luks" | sudo tee -a /etc/crypttab
```

---

## Option 3: File-Level Encryption with `openssl`

Simple approach for backups:

```bash
# Encrypt database file
openssl enc -aes-256-cbc -salt -in hyeyield.db -out hyeyield.db.enc

# Decrypt when needed
openssl enc -d -aes-256-cbc -in hyeyield.db.enc -out hyeyield.db.decrypted
```

---

## Verification

Test that encryption is working:

```bash
# SQLCipher
sqlite3 hyeyield.db ".tables"
# Should fail with: "Error: file is not a database"

# Only works with key
from pysqlcipher3 import dbapi2 as sqlcipher
db = sqlcipher.connect('hyeyield.db')
db.execute("PRAGMA key='your_key'")
db.execute("SELECT * FROM users")
# Should work
```

---

## Performance Impact

- **SQLCipher**: ~5-10% overhead on queries
- **dm-crypt**: ~2-3% overhead at filesystem level
- **Acceptable for most use cases**

---

## Key Management Best Practices

1. **Never commit encryption keys to git**
2. **Rotate keys every 90 days** in production
3. **Store keys in secure key management service** (e.g., HashiCorp Vault)
4. **Use different keys for development and production**
5. **Backup encrypted key** separately from database

---

## Backup & Recovery

```bash
# Backup encrypted database
tar czf database_backup_$(date +%Y%m%d).tar.gz hyeyield.db

# Backup encryption key (in separate secure location)
echo "DATABASE_ENCRYPTION_KEY=..." > /secure/location/encryption_key.txt
```

---

## Recommended Implementation

For **production HyeYield deployment**:

1. Use **SQLCipher** for database-level encryption
2. Use **full-disk encryption** (dm-crypt) for the server
3. Store **encryption keys in environment variables** (via `.env`)
4. **Rotate keys every 90 days**
5. **Backup keys separately** from database

