function(doc) {
	log(doc._id);
	if (doc.type == 'user') {
		emit(doc.join_date, doc);
	}
}