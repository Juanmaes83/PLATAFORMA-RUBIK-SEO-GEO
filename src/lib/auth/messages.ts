// Plain-language messages for the short codes that auth and tenancy actions put in the URL.
// Unknown codes show nothing: the URL cannot inject text into the page.
export const ACCESS_ERRORS: Record<string, string> = {
  datos: "Escribe un correo válido y tu contraseña.",
  credenciales: "Correo o contraseña incorrectos.",
  "sin-confirmar": "Confirma tu correo con el enlace que te enviamos antes de entrar.",
  enlace: "El enlace de confirmación no es válido o ha caducado. Vuelve a registrarte para recibir uno nuevo.",
};

export const ACCESS_NOTICES: Record<string, string> = {
  confirma: "Si el correo es válido, te hemos enviado un enlace para confirmarlo. Ábrelo para terminar el registro y entrar.",
};

export const SIGNUP_ERRORS: Record<string, string> = {
  correo: "Escribe un correo válido.",
  clave: "La contraseña necesita al menos 12 caracteres, con letras y números.",
  registro: "No se pudo completar el registro. Inténtalo de nuevo más tarde.",
};

export const TENANCY_ERRORS: Record<string, string> = {
  "datos-organizacion": "Revisa el nombre y el identificador de la organización.",
  "datos-proyecto": "Revisa el nombre, el identificador y el dominio del proyecto.",
  "identificador-ocupado": "Ese identificador ya está en uso. Elige otro.",
  "no-permitido": "No tienes permiso para hacer eso en esa organización.",
};

export const TENANCY_NOTICES: Record<string, string> = {
  organizacion: "Organización creada. Eres su titular.",
};

export const pick = (table: Record<string, string>, code: string | undefined) =>
  code && Object.hasOwn(table, code) ? table[code] : null;
