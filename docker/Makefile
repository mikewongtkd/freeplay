.PHONY: all clean image

all: clean image

clean:
	docker rmi -f freeplay

image:
	docker build -t freeplay .

