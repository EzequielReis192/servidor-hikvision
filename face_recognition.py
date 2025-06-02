import face_recognition
import sys
import json

# Carregar imagem temporária
image_path = sys.argv[1]
image = face_recognition.load_image_file(image_path)

# Substitua pelos SEUS encodings conhecidos
known_faces = [
    {
        "name": "Seu Nome",
        "encoding": [...]  # Seu encoding facial aqui
    }
]

# Processar rostos
face_locations = face_recognition.face_locations(image)
face_encodings = face_recognition.face_encodings(image, face_locations)

if not face_encodings:
    print("Desconhecido")
    sys.exit()

# Comparar com rostos conhecidos
for face_encoding in face_encodings:
    for known_face in known_faces:
        matches = face_recognition.compare_faces(
            [known_face["encoding"]], 
            face_encoding,
            tolerance=0.6  # Ajuste de sensibilidade
        )
        if True in matches:
            print(known_face["name"])
            sys.exit()

print("Desconhecido")