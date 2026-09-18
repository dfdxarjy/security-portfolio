export const SITE_URL = "https://taktak.hu/";
export const PERSON_ID = `${SITE_URL}#person`;

/** Single reusable Person entity, referenced by `@id` from every page. */
export const PERSON = {
	"@type": "Person",
	"@id": PERSON_ID,
	name: "Taktak",
	url: SITE_URL,
};
