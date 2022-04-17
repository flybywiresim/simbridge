import { Canvas } from 'skia-canvas';

import { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf';

class NodeCanvasFactory {
    create(width: number, height: number) {
        const canvas = new Canvas(width, height);
        const context = canvas.getContext('2d');
        return {
            canvas,
            context,
        };
    }

    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext) {
        // Zeroing the width and height cause Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}

export const pdfToPng = async (document: PDFDocumentProxy, pageNumber: any, scale: number): Promise<Buffer> => {
    try {
        const page = await document.getPage(pageNumber);

        // Render the page on a Node canvas with 100% scale.
        const viewport = page.getViewport({ scale });

        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(
            viewport.width,
            viewport.height,
        );
        const renderContext = {
            canvasContext: canvasAndContext.context,
            viewport,
            canvasFactory,
        };

        const renderTask = page.render(renderContext);
        await renderTask.promise;
        // Convert the canvas to an image buffer.
        const image = await canvasAndContext.canvas.toBuffer('png');

        // Release page resources.
        page.cleanup();
        return image;
    } catch (reason) {
        return Promise.reject(reason);
    }
};
