#[cfg(target_os = "windows")]
mod platform {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub fn protect_password(password: &str) -> Result<Vec<u8>, String> {
        let bytes = password.as_bytes();
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };

        let ok = unsafe {
            CryptProtectData(
                &input,
                null(),
                null(),
                null_mut(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Impossibile proteggere la password con DPAPI.".to_string());
        }
        blob_to_vec(output)
    }

    pub fn unprotect_password(encrypted: &[u8]) -> Result<String, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };

        let ok = unsafe {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null_mut(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Impossibile leggere la password protetta.".to_string());
        }
        let bytes = blob_to_vec(output)?;
        String::from_utf8(bytes).map_err(|_| "Password protetta non valida.".to_string())
    }

    fn blob_to_vec(blob: CRYPT_INTEGER_BLOB) -> Result<Vec<u8>, String> {
        if blob.pbData.is_null() {
            return Err("DPAPI non ha restituito dati.".to_string());
        }
        let bytes = unsafe { std::slice::from_raw_parts(blob.pbData, blob.cbData as usize) };
        let result = bytes.to_vec();
        unsafe {
            LocalFree(blob.pbData.cast());
        }
        Ok(result)
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn protect_password(_password: &str) -> Result<Vec<u8>, String> {
        Err("DPAPI è disponibile solo su Windows.".to_string())
    }

    pub fn unprotect_password(_encrypted: &[u8]) -> Result<String, String> {
        Err("DPAPI è disponibile solo su Windows.".to_string())
    }
}

pub use platform::{protect_password, unprotect_password};

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn dpapi_round_trip() {
        let encrypted = protect_password("p@ss;word}").expect("encrypt");
        assert_ne!(encrypted, b"p@ss;word}".to_vec());
        let decrypted = unprotect_password(&encrypted).expect("decrypt");
        assert_eq!(decrypted, "p@ss;word}");
    }
}
