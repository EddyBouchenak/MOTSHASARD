#!/usr/bin/env python3

# Nom du fichier source (ta liste brute)
input_file = "liste_de_mots.txt"   # <-- avec .txt

# Nom du fichier de sortie
output_file = "mots_tries.txt"

# --- Lecture des mots ---
with open(input_file, "r", encoding="utf-8") as f:
    contenu = f.read()

# Nettoyage : retirer espaces, guillemets et séparateurs
mots = [mot.strip().strip('"') for mot in contenu.replace("\n", ",").split(",") if mot.strip()]

# Tri alphabétique
mots.sort()

# --- Regroupement par première lettre ---
groupes = {}

for mot in mots:
    lettre = mot[0].upper()
    if lettre not in groupes:
        groupes[lettre] = []
    groupes[lettre].append(mot)

# --- Écriture du fichier final ---
with open(output_file, "w", encoding="utf-8") as f:
    for lettre in sorted(groupes.keys()):
        f.write(f'"{lettre}":\n')
        for mot in groupes[lettre]:
            f.write(f'    "{mot}",\n')
        f.write("\n")

print("✔️ Terminé ! Fichier généré :", output_file)
