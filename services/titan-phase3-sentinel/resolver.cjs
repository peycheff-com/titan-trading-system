module.exports = (request, options) => {
    // console.log(`Resolving: ${request} from ${options.basedir}`);
    // Call the default resolver
    try {
        return options.defaultResolver(request, options);
    } catch (e) {
        // If it fails and ends with .js, try removing it
        if (request.endsWith('.js') && (request.startsWith('./') || request.startsWith('../'))) {
            try {
                const stripped = request.slice(0, -3);
                // console.log(`  > Trying stripped: ${stripped}`);
                return options.defaultResolver(stripped, options);
            } catch (e2) {
                // Try .ts explicitly
                try {
                     const ts = request.slice(0, -3) + '.ts';
                     // console.log(`  > Trying .ts: ${ts}`);
                     return options.defaultResolver(ts, options);
                } catch (e3) {
                     // console.log(`  > Failed all.`);
                     throw e;
                }
            }
        }
        throw e;
    }
};
