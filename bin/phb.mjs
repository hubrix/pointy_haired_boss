#!/usr/bin/env node
import { runCli } from '../src/check/cli.mjs';

process.exitCode = await runCli(process.argv.slice(2));
