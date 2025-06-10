#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const args = process.argv.slice(2);
const sourceFolder = args[0];

if (!sourceFolder) {
  console.error('❌ Gebruik: code-zippy <pad-naar-map>');
  process.exit(1);
}

const absoluteSource = path.resolve(sourceFolder);
const outputFolder = path.join(process.cwd(), '_output');
const zipOutputPath = path.join(process.cwd(), '_output.zip');

// Lees .code-zippy-ignore
function readIgnoreList(root) {
  const ignorePath = path.join(root, '.code-zippy-ignore');
  if (!fs.existsSync(ignorePath)) return [];
  const lines = fs.readFileSync(ignorePath, 'utf-8').split('\n');
  return lines.map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

function shouldIgnore(filePath, ignoreList) {
  return ignoreList.some(pattern => {
    return filePath.includes(pattern);
  });
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
    relativePath: path.relative(absoluteSource, file),
    content: fs.readFileSync(file, 'utf-8'),
  }));
}

function chunkContent(content, chunkSize = 2000) {
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
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
    const ignoreList = readIgnoreList(absoluteSource);

    await fs.remove(outputFolder);
    await fs.ensureDir(outputFolder);

    const structure = getFolderStructure(absoluteSource, ignoreList);
    await fs.writeFile(path.join(outputFolder, 'structure.txt'), structure);

    const filePaths = getAllFiles(absoluteSource, [], ignoreList);
    const files = readFiles(filePaths);

    for (const file of files) {
      const targetPath = path.join(outputFolder, 'files', file.relativePath);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, file.content);
    }

    const summaries = files.map(f => summarizeFile(f));
    await fs.writeJSON(path.join(outputFolder, 'summaries.json'), summaries, { spaces: 2 });

    for (const file of files) {
      const chunks = chunkContent(file.content);
      const chunkFolder = path.join(outputFolder, 'chunks', file.relativePath);
      for (let i = 0; i < Math.min(chunks.length, 2); i++) {
        const chunkFile = `${chunkFolder}.chunk${i + 1}.txt`;
        await fs.ensureDir(path.dirname(chunkFile));
        await fs.writeFile(chunkFile, chunks[i]);
      }
    }

    await createZip(outputFolder, zipOutputPath);
    console.log('🎉 Klaar!');
  } catch (err) {
    console.error('❌ Fout:', err);
  }
})();
