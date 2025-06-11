#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { program } = require('commander');
const packageJson = require('../package.json');

program
  .name('code-zippy')
  .description('Zipt een folder met code, genereert een mappenstructuur en samenvattingen — ideaal voor LLM\'s.')
  .version(packageJson.version)
  .argument('<folder>', 'Pad naar de rootfolder met je code')
  .option('-o, --output <pad>', 'Pad voor outputmap', './_code-zippy-output')
  .option('-z, --zip <pad>', 'Naam van het zipbestand', './_code-zippy-output.zip')
  .option('-s, --structure', 'Toon alleen de folderstructuur in terminal')
  .option('--no-chunks', 'Sla het opdelen in tekstchunks over')
  .option('--no-summary', 'Sla het maken van samenvattingen over')
  .option('--ignore <file>', 'Gebruik een ander ignore-bestand', '.code-zippy-ignore')
  .parse();

const options = program.opts();
const sourceFolder = path.resolve(program.args[0]);
const outputFolder = path.resolve(options.output);
const zipOutputPath = path.resolve(options.zip);
const ignoreFile = options.ignore;

if (!sourceFolder) {
  console.error('❌ Je moet een map opgeven.');
  program.help();
  // process.exit(1);
}

function readIgnoreList(root) {
  const customIgnore = path.join(root, ignoreFile);
  const gitIgnore = path.join(root, '.gitignore');
  const file = fs.existsSync(customIgnore)
    ? customIgnore
    : fs.existsSync(gitIgnore)
      ? gitIgnore
      : null;
  if (!file) return [];
  // console.log(`📄 Gebruik ignore-bestand: ${file}`);
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function shouldIgnore(filePath, ignoreList) {
  return ignoreList.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dirPath, arrayOfFiles = [], ignoreList = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (shouldIgnore(fullPath, ignoreList)) return;
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, ignoreList);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

function getFolderStructure(dir, ignoreList, prefix = '') {
  const files = fs.readdirSync(dir);
  let structure = '';
  files.forEach((file, index) => {
    const fullPath = path.join(dir, file);
    if (shouldIgnore(fullPath, ignoreList)) return;
    const isLast = index === files.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    structure += `${prefix}${connector}${file}\n`;
    if (fs.statSync(fullPath).isDirectory()) {
      structure += getFolderStructure(fullPath, ignoreList, prefix + (isLast ? '    ' : '│   '));
    }
  });
  return structure;
}

function readFiles(files) {
  return files.map(file => ({
    path: file,
    relativePath: path.relative(sourceFolder, file),
    content: fs.readFileSync(file, 'utf-8'),
  }));
}

function summarizeFile(file) {
  const lines = file.content.split('\n');
  return {
    file: file.relativePath,
    lines: lines.length,
    characters: file.content.length,
    preview: lines.slice(0, 5).join('\n'),
  };
}

function chunkContent(content, chunkSize = 2000) {
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
}

function createZip(folderPath, outputZipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ ZIP-bestand aangemaakt: ${outputZipPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on('error', err => reject(err));
    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

(async () => {
  try {
    const ignoreList = readIgnoreList(sourceFolder);

    await fs.remove(outputFolder);
    await fs.ensureDir(outputFolder);

    const structure = getFolderStructure(sourceFolder, ignoreList);
    await fs.writeFile(path.join(outputFolder, 'structure.txt'), structure);

    if (options.structure) {
      console.log('\n📁 Mappenstructuur:\n');
      console.log(structure);
      return;
    }

    const filePaths = getAllFiles(sourceFolder, [], ignoreList);
    const files = readFiles(filePaths);

    const filesData = files.map(f => ({
      relativePath: f.relativePath,
      content: f.content
    }));
    await fs.writeJSON(path.join(outputFolder, 'files.json'), filesData, { spaces: 2 });

    for (const file of files) {
      const targetPath = path.join(outputFolder, 'files', file.relativePath);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, file.content);
    }

    if (options.summary) {
      const summaries = files.map(f => summarizeFile(f));
      await fs.writeJSON(path.join(outputFolder, 'summaries.json'), summaries, { spaces: 2 });
    }

    if (options.chunks) {
      for (const file of files) {
        const chunks = chunkContent(file.content);
        const chunkFolder = path.join(outputFolder, 'chunks', file.relativePath);
        for (let i = 0; i < Math.min(chunks.length, 2); i++) {
          const chunkFile = `${chunkFolder}.chunk${i + 1}.txt`;
          await fs.ensureDir(path.dirname(chunkFile));
          await fs.writeFile(chunkFile, chunks[i]);
        }
      }
    }

    await createZip(outputFolder, zipOutputPath);
    fs.moveSync(zipOutputPath, path.join(outputFolder, program.name() + '.zip'), { overwrite: true });
    console.log('🎉 Klaar!');
  } catch (err) {
    console.error('❌ Fout:', err);
  }
})();
