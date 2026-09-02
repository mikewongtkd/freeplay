build:
	@if [ ! -f "node_modules/update" ]; then \
		npm install; \
		rm -f node_modules/update; \
	fi

run: build
	npm start

update-request:
	touch node_modules/update
