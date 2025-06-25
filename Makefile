all: clean network run

network:
	docker network create --driver bridge --subnet 192.168.1.0/24 freeplay_cameras

clean:
	docker network rm -f freeplay_cameras
	docker rm -f freeplay-local

run:
	docker run -it -v `pwd`:/usr/local/freeplay --network host --name freeplay-local freeplay:latest /bin/bash
