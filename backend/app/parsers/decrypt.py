from io import BytesIO

import msoffcrypto
from msoffcrypto.exceptions import FileFormatError


def decrypt_excel(file_bytes: bytes, password: str | None) -> BytesIO:
    source = BytesIO(file_bytes)
    office_file = msoffcrypto.OfficeFile(source)
    if not office_file.is_encrypted():
        source.seek(0)
        return source
    if not password:
        raise ValueError("Encrypted Excel file requires a password")

    decrypted = BytesIO()
    office_file.load_key(password=password)
    office_file.decrypt(decrypted)
    decrypted.seek(0)
    return decrypted


def open_excel_bytes(file_bytes: bytes, password: str | None) -> BytesIO:
    try:
        return decrypt_excel(file_bytes=file_bytes, password=password)
    except FileFormatError:
        buffer = BytesIO(file_bytes)
        buffer.seek(0)
        return buffer
