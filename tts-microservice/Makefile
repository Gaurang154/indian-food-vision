.PHONY: setup run test lint docker-build clean

# Setup local environment
setup:
	pip install -r requirements.txt

# Run the FastAPI server locally
run:
	uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Run all tests
test:
	PYTHONPATH=. pytest tests/ -v

# Build the Docker container
docker-build:
	docker build -t tts-microservice:latest .

# Clean up python cache files
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
