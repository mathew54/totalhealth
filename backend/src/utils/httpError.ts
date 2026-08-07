export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'BAD_REQUEST');
export const unauthorized = (msg = 'No autorizado') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Acceso denegado') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');
