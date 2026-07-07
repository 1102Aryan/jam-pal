FROM python:3.11-slim

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

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
WORKDIR /app
COPY --chown=user . /app

EXPOSE 7860
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
