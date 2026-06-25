#!/usr/bin/env bash
# Build step for the Django backend (Render/Railway "build command").
set -o errexit
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --noinput
