/// <reference types="vite/client" />

declare module 'citeproc/citeproc_commonjs.js' {
    const CSL: {
        Engine: new (
            sys: {
                retrieveLocale: (lang: string) => string;
                retrieveItem: (id: string) => unknown;
            },
            style: string,
            lang: string,
            development: boolean
        ) => {
            updateItems: (ids: string[]) => void;
            previewCitationCluster: (
                citation: unknown,
                citationsPre: unknown[],
                citationsPost: unknown[]
            ) => unknown;
            makeBibliography: () => [unknown, string[]] | false;
        };
    };
    export default CSL;
}
