SHELL := /bin/bash

default: build

build:
	docker build -t freeplay-server .

run:
	docker run -d -it -p3137:80 -p9000:9000 --name freeplay-server-local -v `pwd`/../../src:/usr/local/freeplay -v `pwd`/../../public:/var/www/html -v `pwd`/../../data:/data freeplay-server
