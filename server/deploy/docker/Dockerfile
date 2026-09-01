FROM php:8.5-apache
WORKDIR /usr/local/freeplay
COPY build.sh /tmp
RUN /bin/bash /tmp/build.sh
CMD [ "make", "run" ]
