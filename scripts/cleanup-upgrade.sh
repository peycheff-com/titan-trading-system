#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
dpkg --configure -a
apt-get install -f -y
apt-get upgrade -y
