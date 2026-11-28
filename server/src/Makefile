.PHONY: build management run update-request test

build:
	@if [ ! -f "node_modules/update" ]; then \
		npm install; \
		rm -f node_modules/update; \
	fi

management:
	npm run management &

run: build management
	npm start &
	apachectl graceful


update-request:
	touch node_modules/update

test:
	@echo "Running server in test mode..."
	FREEPLAY_TEST_MODE=1 npm start
