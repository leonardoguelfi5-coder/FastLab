#!/usr/bin/env python3
"""
genera_piante.py
Generates 56 plants with their treatment groups for the FastLab project.
Outputs tab-separated rows (ID_Pianta + Trattamento) to stdout.
"""

data = [
    (1, "Controllo"),
    (2, "Controllo"),
    (3, "Controllo"),
    (4, "Controllo"),
    (5, "Controllo"),
    (6, "Controllo"),
    (7, "Controllo"),
    (8, "Controllo"),
    (9, "Controllo"),
    (10, "Controllo"),
    (11, "Controllo"),
    (12, "Controllo"),
    (13, "Controllo"),
    (14, "Controllo"),
    (15, "Controllo + HC"),
    (16, "Controllo + HC"),
    (17, "Controllo + HC"),
    (18, "Controllo + HC"),
    (19, "Controllo + HC"),
    (20, "Controllo + HC"),
    (21, "S1"),
    (22, "S1"),
    (23, "S1"),
    (24, "S1"),
    (25, "S1"),
    (26, "S1"),
    (27, "S1 + HC"),
    (28, "S1 + HC"),
    (29, "S1 + HC"),
    (30, "S1 + HC"),
    (31, "S1 + HC"),
    (32, "S1 + HC"),
    (33, "W1"),
    (34, "W1"),
    (35, "W1"),
    (36, "W1"),
    (37, "W1"),
    (38, "W1"),
    (39, "W1 + HC"),
    (40, "W1 + HC"),
    (41, "W1 + HC"),
    (42, "W1 + HC"),
    (43, "W1 + HC"),
    (44, "W1 + HC"),
    (45, "S1W1"),
    (46, "S1W1"),
    (47, "S1W1"),
    (48, "S1W1"),
    (49, "S1W1"),
    (50, "S1W1"),
    (51, "S1W1 + HC"),
    (52, "S1W1 + HC"),
    (53, "S1W1 + HC"),
    (54, "S1W1 + HC"),
    (55, "S1W1 + HC"),
    (56, "S1W1 + HC"),
]

if __name__ == "__main__":
    for plant_id, treatment in data:
        print(f"{plant_id}\t{treatment}")
