#!/bin/bash

docker-compose -f ./docker-compose.monitoring.yml down
docker-compose -f ./docker-compose.db.yml down
docker-compose -f ./docker-compose.yml down