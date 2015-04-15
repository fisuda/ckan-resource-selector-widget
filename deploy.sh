#!/bin/bash

authenticate() {
	echo "Authenticate to delete and upload a widget."
	local email
	local password
	read -p "Email: " email
	read -sp "Password: " password

	# Get the log in page and extract autenticity_token
	curl 'https://account.lab.fiware.org/' --cookie-jar cookies.txt -o deploy_login.html > /dev/null
	local authenticity_token=$(awk -F ' ' '/name="csrf-token"/ {print $2}' deploy_login.html | sed 's/"//g' | sed 's/content=//g')

	# Log in
	echo $(curl --location --silent --write-out "%{http_code}" \
		--cookie cookies.txt --cookie-jar cookies.txt \
		--output deploy_inside.html \
		'https://account.lab.fiware.org/users/sign_in' \
		--data-urlencode "authenticity_token=${authenticity_token}" \
		--data-urlencode "user[email]=${email}" \
		--data-urlencode "user[password]=${password}")

	# Get request to the home page in order to get the token
	curl --location 'https://account.lab.fiware.org/home' --cookie cookies.txt --cookie-jar cookies.txt > /dev/null

	# Get request to Mashup page in order to get the oil_sid cookie
	curl --location 'http://mashup.lab.fiware.org/' --cookie cookies.txt --cookie-jar cookies.txt > /dev/null

	# Remove temporary files
	rm deploy_login.html deploy_inside.html

}



VENDOR=$(awk -F '[= ]' '/<widget/ {print $5}' src/config.xml | sed 's/[" >]//g')
NAME=$(awk -F '[= ]' '/<widget/ {print $7}' src/config.xml | sed 's/[" >]//g')
VERSION=$(awk -F '[= ]' '/<widget/ {print $9}' src/config.xml | sed 's/[" >]//g')
FILENAME=$(awk -F ':' '/"name":/ {print $2}' package.json | sed 's/[" ,]//g')
FILE="${VENDOR}_${FILENAME}_${VERSION}-dev.wgt"

STATUS=$(curl -X DELETE -s -w "%{http_code}" "https://mashup.lab.fiware.org/api/resource/${VENDOR}/${NAME}/${VERSION}?affected=true" --cookie cookies.txt | sed 's/[^0-9]*//g')

if [ "$STATUS" = "401" ]; then
	authenticate
	echo $(curl -X DELETE -s -w "%{http_code}" "https://mashup.lab.fiware.org/api/resource/${VENDOR}/${NAME}/${VERSION}?affected=true" --cookie cookies.txt | sed 's/[^0-9]*//g')
fi

curl -X POST -s -w "%{http_code}" -F "file=@build/$FILE;filename=${FILE}" -F "force_create=true" https://mashup.lab.fiware.org/api/resources --cookie cookies.txt > /dev/null

