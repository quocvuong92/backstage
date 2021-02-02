/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import fs from 'fs-extra';
import { JsonValue } from '@backstage/config';
import { runDockerContainer, runCommand } from './helpers';
import { TemplaterBase, TemplaterRunOptions } from '.';
import path from 'path';

const commandExists = require('command-exists-promise');

export class CookieCutter implements TemplaterBase {
  private async fetchTemplateCookieCutter(
    directory: string,
  ): Promise<Record<string, JsonValue>> {
    try {
      return await fs.readJSON(path.join(directory, 'cookiecutter.json'));
    } catch (ex) {
      if (ex.code !== 'ENOENT') {
        throw ex;
      }

      return {};
    }
  }

  public async run({
    workspacePath,
    dockerClient,
    values,
    logStream,
  }: TemplaterRunOptions): Promise<void> {
    const templateDir = path.join(workspacePath, 'template');
    const intermediateDir = path.join(workspacePath, 'intermediate');
    const resultDir = path.join(workspacePath, 'result');

    // First lets grab the default cookiecutter.json file
    const cookieCutterJson = await this.fetchTemplateCookieCutter(templateDir);

    const cookieInfo = {
      ...cookieCutterJson,
      ...values,
    };

    await fs.writeJSON(path.join(templateDir, 'cookiecutter.json'), cookieInfo);

    const cookieCutterInstalled = await commandExists('cookiecutter');
    if (cookieCutterInstalled) {
      await runCommand({
        command: 'cookiecutter',
        args: ['--no-input', '-o', intermediateDir, templateDir, '--verbose'],
        logStream,
      });
    } else {
      await runDockerContainer({
        imageName: 'spotify/backstage-cookiecutter',
        args: [
          'cookiecutter',
          '--no-input',
          '-o',
          '/result',
          '/template',
          '--verbose',
        ],
        templateDir,
        resultDir: intermediateDir,
        logStream,
        dockerClient,
      });
    }

    // if cookiecutter was successful, intermediateDir will contain
    // exactly one directory.
    const [generated] = await fs.readdir(intermediateDir);

    if (generated === undefined) {
      throw new Error('No data generated by cookiecutter');
    }

    await fs.move(path.join(intermediateDir, generated), resultDir);
  }
}
