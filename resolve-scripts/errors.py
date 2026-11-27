"""Error type shared by the Python bridge. Codes are mirrored in src/utils/errors.ts."""


class ResolveError(Exception):
    def __init__(self, code: str, message: str, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def to_json(self) -> dict:
        out = {"code": self.code, "message": self.message}
        if self.details is not None:
            out["details"] = self.details
        return out
