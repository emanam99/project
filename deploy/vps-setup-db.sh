#!/bin/bash
set -e
mysql -e "CREATE DATABASE IF NOT EXISTS alutsmani_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'alutsmani_staging'@'localhost' IDENTIFIED BY 'AlutsmaniStaging2026';"
mysql -e "GRANT ALL PRIVILEGES ON alutsmani_staging.* TO 'alutsmani_staging'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
mysql -e "SHOW DATABASES LIKE 'alutsmani%';"
