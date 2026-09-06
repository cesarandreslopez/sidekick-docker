// Bundle ssh2 itself. Only its optional accelerators are unavailable in the
// portable bundles; ssh2 catches these errors and uses its JavaScript code.
module.exports = {
  name: 'optional-native-accelerators',
  setup(build) {
    build.onResolve({ filter: /^cpu-features$|sshcrypto\.node$/ }, args => ({
      path: args.path,
      namespace: 'optional-accelerator',
    }));
    build.onLoad({ filter: /.*/, namespace: 'optional-accelerator' }, () => ({
      contents: 'throw new Error("Optional native accelerator unavailable");',
    }));
  },
};
