#!/bin/bash
# Run all tests
set -e
cd "$(dirname "$0")"
node --test tests/
