FROM --platform=$BUILDPLATFORM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 创建上传目录和数据持久化目录
RUN mkdir -p /app/uploads /app/data

EXPOSE 8636

CMD ["gunicorn", "--bind", "0.0.0.0:8636", "--workers", "2", "app:app"]
