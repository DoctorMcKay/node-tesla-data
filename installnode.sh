#!/bin/sh
if [ $1 ]; then
        nodeversion=$(wget -qO- https://semver.io/node/resolve/$1)
else
        nodeversion=$(wget -qO- https://semver.io/node/stable)
fi

echo "Installing node.js version $nodeversion 64-bit for Linux..."
wget https://nodejs.org/dist/v$nodeversion/node-v$nodeversion-linux-x64.tar.gz
tar -xzf node-v$nodeversion-linux-x64.tar.gz
rm node-v$nodeversion-linux-x64.tar.gz
cp node-v$nodeversion-linux-x64/bin/node /usr/local/bin
rm -rf node-v$nodeversion-linux-x64

echo "Installing npm..."
wget -qO- https://www.npmjs.com/install.sh | /bin/bash
