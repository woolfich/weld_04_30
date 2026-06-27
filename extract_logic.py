import os
import re
import json
from pathlib import Path

def extract_brace_block(text: str, start_idx: int) -> tuple[str | None, int]:
    """
    Извлекает блок кода, заключенный в {}, начиная с start_idx.
    Корректно игнорирует фигурные скобки внутри строк и шаблонных литералов.
    """
    first_brace = text.find('{', start_idx)
    if first_brace == -1:
        return None, start_idx
        
    depth = 0
    in_string = False
    string_char = None
    i = first_brace
    
    while i < len(text):
        char = text[i]
        
        # Отслеживаем строки, чтобы не считать скобки внутри них
        if char in ('"', "'", '`') and (i == 0 or text[i-1] != '\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None
        
        if not in_string:
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    return text[first_brace:i+1], i + 1
        i += 1
    return None, start_idx

def extract_logic_from_file(file_path: str) -> dict:
    """Извлекает логические блоки из файла."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Чистые .ts файлы (хуки, lib, api) считаем 100% логикой
    if file_path.endswith('.ts') and not file_path.endswith('.tsx'):
        return {
            "type": "pure_logic",
            "content": content.strip(),
            "note": "Чистый TypeScript, логика сохранена полностью"
        }

    # 2. Для .tsx файлов вытаскиваем только структурные логические блоки
    logic_parts = {
        "type": "component_logic",
        "imports": [],
        "types_and_interfaces": [],
        "functions_and_hooks": []
    }

    # Извлекаем импорты
    import_pattern = re.compile(r'^\s*import\s+.*?;?\s*$', re.MULTILINE | re.DOTALL)
    logic_parts["imports"] = [m.group(0).strip() for m in import_pattern.finditer(content)]

    # Извлекаем типы и интерфейсы
    type_starts = re.finditer(r'\b(?:export\s+)?(?:type|interface)\s+\w+', content)
    for match in type_starts:
        brace_start = content.find('{', match.end())
        if brace_start != -1:
            block, _ = extract_brace_block(content, brace_start)
            if block:
                full_block = content[match.start():brace_start] + block
                logic_parts["types_and_interfaces"].append(full_block.strip())

    # Извлекаем функции и хуки (const X = ... => {}, function X() {})
    func_starts = re.finditer(r'\b(?:export\s+)?(?:const|function)\s+\w+', content)
    for match in func_starts:
        brace_start = content.find('{', match.end())
        if brace_start != -1:
            block, _ = extract_brace_block(content, brace_start)
            if block:
                full_block = content[match.start():brace_start] + block
                logic_parts["functions_and_hooks"].append(full_block.strip())

    # Очищаем пустые списки для компактности JSON
    return {k: v for k, v in logic_parts.items() if v}

def main():
    src_dir = "src"
    if not os.path.exists(src_dir):
        print(f"❌ Папка '{src_dir}' не найдена. Запусти скрипт из корня проекта.")
        return

    result = {}
    skipped_files = 0

    for root, dirs, files in os.walk(src_dir):
        # 🗑️ ИГНОРИРУЕМ МУСОР: папка ui, node_modules, .next
        dirs[:] = [d for d in dirs if d not in ['ui', 'node_modules', '.next', '__tests__']]
        
        for file in files:
            # Работаем только с TS/TSX, игнорируем .css и .d.ts
            if file.endswith(('.ts', '.tsx')) and not file.endswith('.d.ts'):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, src_dir)
                
                logic_data = extract_logic_from_file(file_path)
                
                # Если после фильтрации в .tsx файле ничего не осталось, помечаем как пустой
                if logic_data.get("type") == "component_logic" and len(logic_data) <= 1:
                    skipped_files += 1
                    continue
                    
                result[rel_path] = logic_data

    # Сохраняем в JSON
    output_file = "app_logic.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    print("✅ Успешно!")
    print(f"📁 Обработано файлов с логикой: {len(result)}")
    print(f"🗑️ Пропущено (мусор/пустые): {skipped_files}")
    print(f"💾 Результат сохранен в: {output_file}")

if __name__ == "__main__":
    main()