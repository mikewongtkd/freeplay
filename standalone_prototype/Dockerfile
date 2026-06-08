FROM python:3.10
RUN apt-get update

WORKDIR /app

# Install dependencies from requirements
COPY getting_started/requirements.txt .
RUN pip install -r requirements.txt

# Copy the application files
COPY . .

CMD ["python", "app.py"]
