import os
import re
import random
import string

def generate_random_name(length=12):
    """Rastgele ve karmaşık bir isim üretir."""
    first_char = random.choice(string.ascii_letters) # Değişkenler sayı ile başlayamaz
    rest = ''.join(random.choices(string.ascii_letters + string.digits, k=length-1))
    return first_char + rest

def obfuscate_code(file_path):
    """Dosya içeriğindeki tanımlayıcıları polimorfik olarak değiştirir."""
    if not os.path.exists(file_path):
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Önekli (prefix) yapıları bul: var_..., def_..., func_...
    # Bu yapı, obfuscator'ın neyi değiştireceğini bilmesini sağlar.
    patterns = [r'\bvar_\w+', r'\bdef_\w+', r'\bfunc_\w+']
    unique_matches = set()
    for pattern in patterns:
        matches = re.findall(pattern, content)
        unique_matches.update(matches)

    if not unique_matches:
        return

    # Her eşleşme için benzersiz bir harita oluştur
    mapping = {old: generate_random_name() for old in unique_matches}

    # Kodun içindeki isimleri değiştir
    for old_name, new_name in mapping.items():
        # Sadece tam kelime eşleşmelerini değiştir (regex \b kullanarak)
        content = re.sub(rf'\b{old_name}\b', new_name, content)

    # Rastgele "Zaman Gürültüsü" (Stealth Delay) enjekte et
    if "import time" in content:
        noise = f"\n    time.sleep({random.uniform(0.1, 0.5):.2f}) # Stealth Noise\n"
        content = content.replace("def ", f"def _internal_{generate_random_name(4)}(): pass\n    def ", 1)
        content = content.replace("next(self):", f"next(self):\n{noise}", 1)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"[Stealth] {os.path.basename(file_path)}: {len(unique_matches)} tanımlayıcı polimorfik olarak maskelendi.")

if __name__ == "__main__":
    # Aegis Engine modülleri için hedef dizinler
    target_dirs = ['core', 'agents', 'trading', 'finance']
    base_dir = os.path.dirname(os.path.abspath(__file__))
    for d in target_dirs:
        dir_path = os.path.join(base_dir, d)
        for root, _, files in os.walk(dir_path):
            for file in files:
                if file.endswith('.py') and not file.startswith('__'):
                    obfuscate_code(os.path.join(root, file))