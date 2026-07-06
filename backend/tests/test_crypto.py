def test_key_is_created_once_and_reused(app_home):
    import app.core.crypto as crypto
    import app.core.paths as paths

    f1 = crypto.get_fernet()
    assert paths.get_key_path().exists()
    key_bytes = paths.get_key_path().read_bytes()

    f2 = crypto.get_fernet()
    # Same key file, so a token from f1 must decrypt with f2.
    token = f1.encrypt(b"hello")
    assert f2.decrypt(token) == b"hello"
    assert paths.get_key_path().read_bytes() == key_bytes


def test_encrypt_decrypt_roundtrip(app_home):
    import app.core.crypto as crypto

    secret = "sk-1234567890abcdef"
    token = crypto.encrypt(secret)

    assert token != secret
    assert crypto.decrypt(token) == secret


def test_mask_secret(app_home):
    import app.core.crypto as crypto

    assert crypto.mask_secret("sk-1234567890") == "sk-1****"
    assert crypto.mask_secret("abc") == "****"
    assert crypto.mask_secret("") == ""
