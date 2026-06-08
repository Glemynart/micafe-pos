import json
import sys

log_file = r'C:\Users\seguc\.gemini\antigravity\brain\52976e21-0d8f-480c-af1f-a488fd028518\.system_generated\logs\transcript.jsonl'
files_to_find = ['clientes-module.tsx', 'inventory-module.tsx', 'recipes-module.tsx', 'global-close-shift.tsx', 'globals.css']

found = set()

with open(log_file, 'r', encoding='utf-8') as f:
    for line in f:
        if not line.strip(): continue
        try:
            entry = json.loads(line)
            # Some versions use entry['content'] for TOOL_RESPONSE
            content = ""
            if entry.get("type") == "TOOL_RESPONSE":
                if "tool_responses" in entry:
                    for tr in entry["tool_responses"]:
                        content += tr.get("content", "") + "\n"
                elif "content" in entry:
                    content = entry["content"]
                
                for target_file in files_to_find:
                    if target_file not in found and target_file in content and "The following code has been modified to include a line number" in content:
                        found.add(target_file)
                        lines = content.split('\n')
                        code_lines = []
                        is_code = False
                        for l in lines:
                            if l.startswith("1: "):
                                is_code = True
                            if is_code:
                                if ":" in l:
                                    parts = l.split(":", 1)
                                    if parts[0].isdigit():
                                        code_lines.append(parts[1][1:]) # strip space
                                    else:
                                        code_lines.append(l)
                                else:
                                    code_lines.append(l)
                        
                        out_name = "original_" + target_file.replace("-", "_").replace(".", "_") + ".txt"
                        if target_file == "globals.css":
                            out_name = "original_globals.css"
                        with open(out_name, 'w', encoding='utf-8') as out_f:
                            out_f.write('\n'.join(code_lines))
                        print(f"Extracted {target_file} to {out_name}")
                        
        except Exception as e:
            pass

print("Done. Found:", found)
