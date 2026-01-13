#!/bin/bash

docker-compose -f ./docker-compose.monitoring.yml up --build -d
docker-compose -f ./docker-compose.db.yml up --build -d
docker-compose -f ./docker-compose.yml up --build -d