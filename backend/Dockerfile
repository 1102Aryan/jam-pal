FROM python:3.11-slim

WORKDIR /app

# CPU-only torch is ~600 MB vs ~2 GB for the default CUDA build.
# Installed first so this heavy layer is cached and rebuilds are fast.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# anticipation library (Thickstun et al.)
RUN pip install --no-cache-dir git+https://github.com/jthickstun/anticipation.git

# remaining backend deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app code
COPY app/ ./app/

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
