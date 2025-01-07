/*
    BSD 3-Clause License    
    Copyright (c) 2023, Doosan Robotics Inc.
*/
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const obfuscator = require('javascript-obfuscator');
const svgrPlugin = require('esbuild-plugin-svgr');
const { sassPlugin, postcssModules } = require('esbuild-sass-plugin');

// initialize manifest.json for root
const rootManifestFileName = 'manifest.json';
const rootManifest = require(`../${rootManifestFileName}`);
const packageJson = require(`./package.json`);
const packageName = rootManifest.packageName;
const assetDir = 'assets';
const drscModulePkgFileName = rootManifest.drscModulePackageFile;
const drcfModulePkgFileName = rootManifest.drcfModulePackageFile;

// initialize manifest.json for DART-Platform
const manifestFileName = 'manifest.json';
const manifest = require(`./${manifestFileName}`);

// initialize misc.
const rootDir = path.join(__dirname, '../');
const buildDir = path.join(__dirname, 'build');
const buildPkgDir = path.join(buildDir, packageName);
const outputDir = path.join(__dirname, '../../output');
const outputPkgDir = path.join(outputDir, packageName);
function move(fileName, fromDir, toDir) {
  if (fileName && fileName.trim().length > 0 && fs.existsSync(path.join(fromDir, fileName))) {
    fs.moveSync(path.join(fromDir, fileName), path.join(toDir, fileName));
  }
}

function copy(fileName, fromDir, toDir) {
  if (fileName && fileName.trim().length > 0 && fs.existsSync(path.join(fromDir, fileName))) {
    fs.copySync(path.join(fromDir, fileName), path.join(toDir, fileName));
  }
}

function copyToDirPath(fileName, fromDir, toDirPath) {
  if (fileName && fileName.trim().length > 0 && fs.existsSync(path.join(fromDir, fileName))) {
    fs.copySync(path.join(fromDir, fileName), toDirPath);
  }
}

function remove(fileName, fromDir) {
  if (fileName && fileName.trim().length > 0 && fs.existsSync(path.join(fromDir, fileName))) {
    fs.removeSync(path.join(fromDir, fileName));
  }
}

function copyScreenIcons() {
  for (let i = 0, {length} = manifest.screens; i < length; i++) {
      const screen = manifest.screens[i];
      if (screen.icon) {
          copyToDirPath(screen.icon, __dirname, path.join(buildPkgDir, "assets", screen.icon));
      }
  }
}

async function packDrscModulePackage() {
  copyScreenIcons();
  copy(manifestFileName, __dirname, buildPkgDir);
  copyToDirPath(`src/assets/uc`, __dirname, path.join(buildPkgDir, 'assets/uc'));
  copyToDirPath(`src/assets/raws`, __dirname, path.join(buildPkgDir, 'assets/raws'));
  const zip = new AdmZip();
  zip.addLocalFolder(buildPkgDir);
  const dstName = path.join(buildDir, drscModulePkgFileName);
  await zip
    .writeZipPromise(dstName, null)
    .then(() => {
      console.log(`Successfully compress ${buildPkgDir} to ${dstName}.`);
    })
    .catch((e) => {
      console.error(e);
    });
}

async function packTotalModulePackage() {
  copy(assetDir, rootDir, outputPkgDir);
  copy(rootManifestFileName, rootDir, outputPkgDir);
  copy(drscModulePkgFileName, buildDir, outputPkgDir);
  copy(drcfModulePkgFileName, rootDir, outputPkgDir);

  const zip = new AdmZip();
  zip.addLocalFolder(outputPkgDir);
  const dmFileName = `${packageName}_${rootManifest.version}.dm`;
  const dstName = path.join(outputDir, dmFileName);
  await zip
    .writeZipPromise(dstName, null)
    .then(() => {
      remove(packageName, outputDir);
      move(dmFileName, outputDir, outputPkgDir);
      console.log(`Successfully compress ${outputPkgDir} to ${path.join(outputPkgDir, dmFileName)}.`);
    })
    .catch((e) => {
      console.error(e);
    });
}

function packModulePackage() {
  return {
    name: 'PackagingModulePackage',
    setup(build) {
      build.onStart(() => {
        remove(packageName, buildDir);
        remove(packageName, outputDir);
        remove(`${packageName}.dm`, outputDir);
      });
      build.onEnd(async () => {
        await packDrscModulePackage()
          .then(async () => await packTotalModulePackage())
          .catch((e) => console.error(e));
      });
    },
  };
}

function obfuscatorPlugin(options = {}) {
  return {
    name: 'Obfuscator',
    setup(build) {
      build.onEnd(async () => {
        const outputFilePath = build.initialOptions.outfile;
        if (await fs.pathExists(outputFilePath)) {
          const contents = await fs.readFile(outputFilePath, 'utf8');
          const addStyleText = `document.head.appendChild(document.createElement("style"))`;
          const contentFinal = contents.replaceAll(addStyleText, `var elStyle = ${addStyleText}; elStyle.id = "module_${packageName}"; elStyle`);
          const result = obfuscator.obfuscate(
            contentFinal, // Output file from ESBuild
            {
              // Obfuscation options (you can customize these)
              // Add more obfuscation options here
              ...options,
            },
          );
          if (result) {
            // Write the obfuscated code back to the output file
            await fs.writeFile(outputFilePath, `(()=>{${result.getObfuscatedCode()}})();/*moduleU2FsdGVkX1+o8OlVNpDbxdwBRR9zmO9if6YBzvwJJkI=*/`);
          }
        }
      });
    },
  };
}

function toUnixPath(path) {
  return path.replace(/[\\/]+/g, '/').replace(/^([a-zA-Z]+:|\.\/)/, '');
}

function assetFileLoaderPlugin() {
  // Workaround for https://github.com/evanw/esbuild/issues/1441
  return {
    name: 'AssetFileLoader',
    setup: (build) => {
      build.onLoad(
        {
          filter: /.*/,
        },
        async (args) => {
          if (!/\.((m?jsx?)|(tsx?)|(c|sc|sa)ss|(svg)|(json))$/.test(args.path)) {
            if (await fs.pathExists(args.path)) {
              const contents = await fs.readFile(args.path);
              const assetFilePath = path.join(assetDir, args.path.replace(__dirname, ''));
              const assetOutputPath = path.join(buildPkgDir, assetFilePath);

              await fs.mkdir(path.dirname(assetOutputPath), {
                recursive: true,
              });
              await fs.writeFile(assetOutputPath, contents);
              return {
                contents: `
                const moduleScript = Array.from(document.body.childNodes).find(child => child.id === 'script-${packageName}');
                let path = '${toUnixPath(assetFilePath)}';
                path = moduleScript?.src?.replace('${manifest.main}', path) ?? path;
                export default path;`,
                loader: 'js',
              };
            }
          }
        },
      );
    },
  };
}

const timeStart = performance.now();
esbuild
  .build({
    entryPoints: [`./src/index.tsx`], // Your main entry file
    bundle: true,
    outfile: path.join(buildPkgDir, manifest.main),
    legalComments: 'external',
    minify: true,
    format: 'esm',
    plugins: [
      assetFileLoaderPlugin(),
      sassPlugin({
        type: 'style',
        transform: postcssModules({generateScopedName: `[module_${packageName}][local]`}),
      }),
      svgrPlugin(),
      obfuscatorPlugin(),
      packModulePackage(),
    ],
  })
  .then(() => {
    console.log('Build complete! ✅', performance.now() - timeStart);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
