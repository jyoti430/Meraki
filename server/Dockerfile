FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server /app/server
RUN useradd --create-home meraki && mkdir -p /app/var/documents && chown -R meraki:meraki /app
USER meraki
EXPOSE 8000
CMD ["uvicorn", "server.meraki.app:app", "--host", "0.0.0.0", "--port", "8000"]
